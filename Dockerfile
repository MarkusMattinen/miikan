# miikan app, node.js, nginx, etcd registration and supervisord
FROM markusma/nodejs:0.12

COPY . /app
WORKDIR /app

RUN mkdir -p /etc/confd/conf.d /etc/confd/templates /etc/supervisor/conf.d \
 && mv /app/config/etc/confd/conf.d/* /etc/confd/conf.d/ \
 && mv /app/config/etc/confd/templates/* /etc/confd/templates/ \
 && mv /app/config/etc/supervisor/conf.d/* /etc/supervisor/conf.d/ \
 && rm -rf /app/config

RUN apt-get update \
 && apt-get install -y --no-install-recommends `cat /app/Aptfile` build-essential \
 && npm install 2>&1 >/dev/null \
 && apt-get purge -y build-essential \
 && apt-get autoremove -y \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

ENV PORT 5001
EXPOSE 5000
