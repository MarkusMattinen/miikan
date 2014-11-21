# miikan app, node.js, nginx, etcd registration and supervisord on trusty
FROM markusma/nginx-etcd:trusty

RUN add-apt-repository ppa:chris-lea/node.js \
 && apt-get update \
 && apt-get install -y --no-install-recommends nodejs imagemagick supervisor ghostscript libzip-dev build-essential \
 && npm install formidable imagemagick rimraf async zip-paths 2>&1 >/dev/null \
 && apt-get purge -y build-essential \
 && apt-get autoremove -y \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

ADD config/srv/http /srv/http
ADD config/srv/nodejs /srv/nodejs
ADD config/etc/supervisor /etc/supervisor
ADD config/etc/confd /etc/confd

EXPOSE 5000
