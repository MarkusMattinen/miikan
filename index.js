#!/usr/bin/env node
'use strict';

var path = require('path');
var crypto = require('crypto');
var fs = require('fs');
var imageMagick = require('imagemagick');
var rimraf = require('rimraf');
var async = require('async');
var zipPaths = require('zip-paths');
var express = require('express');
var multer = require('multer');
var _ = require('lodash');
var serveStatic = require('serve-static');

var app = express();

function decimalPlaces (value) {
    var match = value.match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
    if (!match) return 0;
    return Math.max(0, (match[1] ? match[1].length : 0) - (match[2] ? +match[2] : 0));
}

app.use(multer({
    dest: '/tmp/'
}));

function finalize(err, resultFilenames, sessionDir, req, res, files) {
    if (resultFilenames.length > 1) {
        var zip = new zipPaths(sessionDir + '/results.zip');

        async.each(resultFilenames, function (filename, callback) {
            zip.add(filename, { cwd: sessionDir }, function (err) {
                if (err) console.log(err);
                callback();
            });
        }, function() {
            zip.compress(function(err, bytes) {
                if (err) console.log(err);
                res.writeHead(200, {
                    'Content-Type': 'application/zip',
                    'Content-Disposition': 'attachment; filename=results.zip'
                });

                res.end(fs.readFileSync(sessionDir + '/results.zip'));
                rimraf(sessionDir, function() {});
            });
        });
    } else {
        if (files.length === 1) {
            res.writeHead(200, {
                'Content-Type': files[0].mimetype,
                'Content-Disposition': 'attachment; filename=' + resultFilenames[0]
            });

            res.end(fs.readFileSync(sessionDir + '/' + resultFilenames[0]));
        } else {
            res.writeHead(204);
            res.end();
        }

        rimraf(sessionDir, function() {});
    }
}

app.post('/api/annotate', function(req, res) {
    var resultFilenames = [];
    var sessionId = crypto.randomBytes(20).toString('hex');
    var sessionDir = '/tmp/' + sessionId;

    var files;

    if (_.isArray(req.files["files[]"])) {
        files = req.files["files[]"];
    } else {
        files = [ req.files["files[]"] ];
    }

    var zinterval = 0;
    var zunit = '';
    var xyinterval = 0;
    var xyunit = '';
    var zdecimal = 0;
    var xydecimal = 0;
    var fontsize = 32;
    var xyintervalcount = 1;

    if (parseFloat(req.body.zinterval)) {
        zdecimal = decimalPlaces(req.body.zinterval);
        zinterval = parseFloat(req.body.zinterval);
    }

    zunit = req.body.zunit;

    if (parseFloat(req.body.xyinterval)) {
        xydecimal = decimalPlaces(req.body.xyinterval);
        xyinterval = parseFloat(req.body.xyinterval);
    }

    xyunit = req.body.xyunit;

    if (parseFloat(req.body.fontsize)) {
        fontsize = parseFloat(req.body.fontsize);
    }

    if (parseFloat(req.body.xyintervalcount)) {
        xyintervalcount = parseFloat(req.body.xyintervalcount);
    }

    fs.mkdirSync(sessionDir);

    _.each(files, function(file) {
        fs.renameSync(file.path, sessionDir + '/' + file.originalname);
    });

    async.each(files, function (file, callback) {
        imageMagick.identify(sessionDir + '/' + file.originalname, function(err, features) {
            var dpiMultiplier = features.width / 1408;
            console.log("dpiMultiplier", dpiMultiplier);

            var convertArr = [sessionDir + '/' + file.originalname, '-transparent', 'white', '-stroke', 'black', '-strokewidth', '' + (4 * dpiMultiplier).toFixed(0)];

            var drawLine = function(line) {
                convertArr.push('-draw');
                convertArr.push('line ' + (line.start.x * dpiMultiplier).toFixed(0) + ',' + (line.start.y * dpiMultiplier).toFixed(0) + ' ' + (line.end.x * dpiMultiplier).toFixed(0) + ',' + (line.end.y * dpiMultiplier).toFixed(0));
            };

            var copyLineWithOffset = function(line, offsets) {
                var newLine = JSON.parse(JSON.stringify(line));
                newLine.start.x += offsets.start.x;
                newLine.start.y += offsets.start.y;
                newLine.end.x += offsets.end.x;
                newLine.end.y += offsets.end.y;
                return newLine;
            };

            var copyPointWithOffset = function(point, offset) {
                var newPoint = JSON.parse(JSON.stringify(point));
                newPoint.x += offset.x;
                newPoint.y += offset.y;
                return newPoint;
            };

            var pointOnLine = function(line, fromStart) {
                return {
                    x: line.start.x + (line.end.x - line.start.x) * fromStart,
                    y: line.start.y + (line.end.y - line.start.y) * fromStart
                };
            };

            var lineFromPoint = function(point, line) {
                return copyLineWithOffset(line, { start: point, end: point });
            };

            var centerGravityHorizontal = function(point) {
                point.x = point.x - (features.width / dpiMultiplier / 2);
                return point;
            };

            var toggleGravityHorizontal = function(point) {
                point.x = (features.width / dpiMultiplier) - point.x;
                return point;
            };

            var drawRotatedTextFromPoint = function(text, point, rotation) {
                convertArr.push('-draw');
                convertArr.push('translate ' + (point.x * dpiMultiplier).toFixed(0) + ',' + (point.y * dpiMultiplier).toFixed(0) + ' rotate ' + rotation + ' text 0,0 \'' + text + '\'');
            };

            var verticalLine = { start: { x: 224, y: 434 }, end: { x: 224, y: 612 } };
            var diagonalLine1 = { start: { x: 224, y: 612 }, end: { x: 704, y: 852 } };
            var diagonalLine2 = { start: { x: 704, y: 852 }, end: { x: 1188, y: 612 } };

            drawLine(verticalLine);

            var notchLengthX = 16;
            var notchLengthY = 8;

            var diagonalLine1Offsets = { start: { x: -notchLengthX, y: -notchLengthY }, end: { x: notchLengthX, y: notchLengthY } };
            drawLine(copyLineWithOffset(diagonalLine1, diagonalLine1Offsets));

            var diagonalLine2Offsets = { start: { x: -notchLengthX, y: notchLengthY }, end: { x: notchLengthX, y: -notchLengthY } };
            drawLine(copyLineWithOffset(diagonalLine2, diagonalLine2Offsets));

            var notchToLeft = { start: { x: 0, y: 0 }, end: { x: -notchLengthX, y: 0 } };
            drawLine(lineFromPoint(pointOnLine(verticalLine, 0), notchToLeft));
            drawLine(lineFromPoint(pointOnLine(verticalLine, 0.5), notchToLeft));

            for (var i = 0; i < xyintervalcount; ++i) {
                var notchToBottomLeft = { start: { x: 0, y: 0 }, end: { x: -notchLengthX, y: notchLengthY } };
                drawLine(lineFromPoint(pointOnLine(diagonalLine1, i * (1 / xyintervalcount)), notchToBottomLeft));
            }

            for (var i = 1; i < xyintervalcount + 1; ++i) {
                var notchToBottomRight = { start: { x: 0, y: 0 }, end: { x: notchLengthX, y: notchLengthY } };
                drawLine(lineFromPoint(pointOnLine(diagonalLine2, i * (1 / xyintervalcount)), notchToBottomRight));
            }

            convertArr.push('-gravity');
            convertArr.push('northwest');

            convertArr.push('-stroke');
            convertArr.push('none');
            convertArr.push('-fill');
            convertArr.push('black');
            convertArr.push('-pointsize');
            convertArr.push((fontsize * dpiMultiplier).toFixed(0));

            if (xyintervalcount === 1) {
                convertArr.push('-gravity');
                convertArr.push('north');

                var textOffsetX = 16;
                var textOffsetY = -8;
                var textRotation = 26.565 // arctan(0.5)

                drawRotatedTextFromPoint((xyinterval).toFixed(xydecimal) + ' ' + xyunit, centerGravityHorizontal(copyPointWithOffset(pointOnLine(diagonalLine1, 0.5), { x: -notchLengthX - textOffsetX, y: notchLengthY + textOffsetY })), textRotation);
            } else {
                convertArr.push('-gravity');
                convertArr.push('northeast');

                var textOffsetX = 2;
                var textOffsetY = 1;

                for (var i = 1; i < xyintervalcount + 1; ++i) {
                    drawRotatedTextFromPoint((i * xyinterval).toFixed(xydecimal) + ' ' + xyunit, toggleGravityHorizontal(copyPointWithOffset(pointOnLine(diagonalLine1, (1 - i * (1 / xyintervalcount))), { x: -notchLengthX - textOffsetX, y: notchLengthY + textOffsetY })), 0);
                }
            }

            convertArr.push('-gravity');
            convertArr.push('northeast');

            drawRotatedTextFromPoint((zinterval).toFixed(zdecimal) + ' ' + zunit, toggleGravityHorizontal(copyPointWithOffset(pointOnLine(verticalLine, 0.0), { x: -notchLengthX - 4, y: fontsize * -0.4 })), 0);
            drawRotatedTextFromPoint('0', toggleGravityHorizontal(copyPointWithOffset(pointOnLine(verticalLine, 0.5), { x: -notchLengthX - 4, y: fontsize * -0.4 })), 0);

            if (xyintervalcount === 1) {
                convertArr.push('-gravity');
                convertArr.push('north');

                var textOffsetX = 16;
                var textOffsetY = -8;

                drawRotatedTextFromPoint((xyinterval).toFixed(xydecimal) + ' ' + xyunit, centerGravityHorizontal(copyPointWithOffset(pointOnLine(diagonalLine2, 0.5), { x: notchLengthX + textOffsetX, y: notchLengthY + textOffsetY })), -textRotation);
            } else {
                convertArr.push('-gravity');
                convertArr.push('northwest');

                var textOffsetX = 4;
                var textOffsetY = 2;

                for (var i = 1; i < xyintervalcount + 1; ++i) {
                    drawRotatedTextFromPoint((i * xyinterval).toFixed(xydecimal) + ' ' + xyunit, copyPointWithOffset(pointOnLine(diagonalLine2, i * (1 / xyintervalcount)), { x: notchLengthX + textOffsetX, y: notchLengthY + textOffsetY }), 0);
                }
            }

            convertArr.push(sessionDir + '/annotated-' + file.originalname);

            console.log(convertArr);

            imageMagick.convert(convertArr, function(err, stdout, stderr) {
                if (err) console.log(err);
                if (stdout) console.log(stdout);
                if (stderr) console.log(stderr);

                resultFilenames.push('annotated-' + file.originalname);
                callback();
            });
        });
    }, function(err) {
        finalize(err, resultFilenames, sessionDir, req, res, files);
    });
});

app.post('/api/resize', function(req, res) {
    var resultFilenames = [];
    var sessionId = crypto.randomBytes(20).toString('hex');
    var sessionDir = '/tmp/' + sessionId;

    var files;

    if (_.isArray(req.files["files[]"])) {
        files = req.files["files[]"];
    } else {
        files = [ req.files["files[]"] ];
    }

    var scalePercentage = 100;

    if (parseFloat(req.body.resizepercentage)) {
        scalePercentage = parseFloat(req.body.resizepercentage);
    }

    fs.mkdirSync(sessionDir);

    _.each(files, function(file) {
        fs.renameSync(file.path, sessionDir + '/' + file.originalname);
    });

    async.each(files, function (file, callback) {
        imageMagick.identify(sessionDir + '/' + file.originalname, function(err, features) {
            var ext;
            var filenameWithoutExt;

            if (file.originalname.indexOf('.') > 0) {
                ext = '.' + file.originalname.split('.').slice(-1)[0];
                filenameWithoutExt = file.originalname.replace(ext, '');
            } else {
                ext = '';
                filenameWithoutExt = file.originalname;
            }

            var newFilename = filenameWithoutExt + '_' + scalePercentage + '%' + ext;
            var convertArr = [sessionDir + '/' + file.originalname, '-filter', 'Lanczos', '-sampling-factor', '1x1', '-resize', scalePercentage + '%', '-unsharp', '1.5x1+0.7+0.02', sessionDir + '/' + newFilename ];

            console.log(convertArr);

            imageMagick.convert(convertArr, function(err, stdout, stderr) {
                if (err) console.log(err);
                if (stdout) console.log(stdout);
                if (stderr) console.log(stderr);

                resultFilenames.push(newFilename);
                callback();
            });
        });
    }, function(err) {
        finalize(err, resultFilenames, sessionDir, req, res, files);
    });
});

app.post('/api/legend', function(req, res) {
    var resultFilenames = [];
    var sessionId = crypto.randomBytes(20).toString('hex');
    var sessionDir = '/tmp/' + sessionId;

    var files;

    if (_.isArray(req.files["files[]"])) {
        files = req.files["files[]"];
    } else {
        files = [ req.files["files[]"] ];
    }

    var legendscale = 0;
    var legendscaledecimal = 0;
    var legendunit = '';
    var legendcolor = '';
    var fontsize = 32;

    if (parseFloat(req.body.legendscale)) {
        legendscaledecimal = decimalPlaces(req.body.legendscale);
        legendscale = parseFloat(req.body.legendscale);
    }

    legendunit = req.body.legendunit;
    legendcolor = req.body.legendcolor;

    if (parseFloat(req.body.fontsize)) {
        fontsize = parseFloat(req.body.fontsize);
    }

    fs.mkdirSync(sessionDir);

    _.each(files, function(file) {
        fs.renameSync(file.path, sessionDir + '/' + file.originalname);
    });

    async.each(files, function (file, callback) {
        imageMagick.identify(sessionDir + '/' + file.originalname, function(err, features) {
            var dpiMultiplier = features.width / 576;

            console.log("dpiMultiplier", dpiMultiplier);

            var htextPadding = 16 * dpiMultiplier;
            var vtextPaddingOuter = 0;
            var vtextPaddingInner = 16 * dpiMultiplier;

            var convertArr = [
                sessionDir + '/' + file.originalname,
                '-background',
                'none',
                '-gravity',
                'center',
                '-stroke',
                'none',
                '-fill',
                'black',
                '-pointsize',
                (fontsize * dpiMultiplier).toFixed(0),
                '(',
                    './skaala_' + legendcolor + '.png',
                    '-resize',
                    'x' + (features.height - fontsize * dpiMultiplier * 1.5 - vtextPaddingInner * 2 - vtextPaddingOuter * 2),
                    '-resize',
                    '200x100%',
                    '-bordercolor',
                    'gray50',
                    '-border',
                    '1',
                    '-bordercolor',
                    'none',
                    '(',
                        'label:' + legendscale.toFixed(legendscaledecimal) + ' ' + legendunit,
                        '-trim',
                        '+repage',
                        '-border',
                        htextPadding.toFixed(0) + 'x' + (vtextPaddingOuter + vtextPaddingInner).toFixed(0),
                        '-crop',
                        '+0+' + vtextPaddingInner.toFixed(0),
                        '-crop',
                        '+0-' + vtextPaddingOuter.toFixed(0),
                        '+repage',
                    ')',
                    '+swap',
                    '-append',
                    '(',
                        'label:' + (legendscale * -1).toFixed(legendscaledecimal) + ' ' + legendunit,
                        '-trim',
                        '+repage',
                        '-border',
                        htextPadding.toFixed(0) + 'x' + (vtextPaddingOuter + vtextPaddingInner).toFixed(0),
                        '-crop',
                        '+0-' + vtextPaddingInner.toFixed(0),
                        '-crop',
                        '+0+' + vtextPaddingOuter.toFixed(0),
                        '+repage',
                    ')',
                    '-append',
                ')',
                '+append',
                sessionDir + '/legend-' + file.originalname
            ];

            console.log(convertArr);

            imageMagick.convert(convertArr, function(err, stdout, stderr) {
                if (err) console.log(err);
                if (stdout) console.log(stdout);
                if (stderr) console.log(stderr);

                resultFilenames.push('legend-' + file.originalname);
                callback();
            });
        });
    }, function(err) {
        finalize(err, resultFilenames, sessionDir, req, res, files);
    });
});

app.use(serveStatic('frontend'));

app.listen(process.env.PORT || 5000);
