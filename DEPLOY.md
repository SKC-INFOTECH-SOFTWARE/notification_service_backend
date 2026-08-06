# Deploy Commands

`<SERVER_IP>` · `<STRONG_PASSWORD>` replace karo.
App dir: `/var/www/notification_service`

---

## 1. LOCAL — push

```powershell
cd D:\notification
git checkout -- bun.lock
git add .gitignore .dockerignore docker-compose.prod.yml docker-compose.yml .github/workflows/deploy.yml DEPLOY.md
git commit -m "Build on VPS + deploy runbook [skip ci]"
git push origin main
```

---

## 2. SERVER — prep (root)

```bash
ssh root@<SERVER_IP>
```

```bash
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy/

curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
apt update && apt install -y git

mkdir -p /var/www
chown deploy:deploy /var/www

ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

free -h && docker --version && docker compose version && git --version
exit
```

---

## 3. SERVER — clone (deploy)

```bash
ssh deploy@<SERVER_IP>
```

```bash
ssh-keygen -t ed25519 -C "vps-deploy" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

→ GitHub repo → Settings → Deploy keys → Add deploy key

```bash
ssh -T git@github.com

cd /var/www
git clone git@github.com:SKC-INFOTECH-SOFTWARE/notification_service_backend.git notification_service
cd /var/www/notification_service
ls -la
```

---

## 4. LOCAL → SERVER — `.env` + backup

```powershell
cd D:\notification
scp .env                deploy@<SERVER_IP>:/var/www/notification_service/
scp mongo_backup.tar.gz deploy@<SERVER_IP>:/var/www/notification_service/
```

```bash
cd /var/www/notification_service
chmod 600 .env
nano .env
```

Sirf ye do:

```ini
FRONTEND_URL=https://notifyadmin.mesmi.co.in
ADMIN_DEFAULT_PASSWORD=<STRONG_PASSWORD>
```

> `CREDENTIAL_ENCRYPTION_KEY` aur `ADMIN_JWT_SECRET` mat badlo — backup ke encrypted credentials isi key pe khulte hain.

---

## 5. SERVER — BACKUP APPLY

```bash
cd /var/www/notification_service

docker compose -f docker-compose.prod.yml create mongo

VOL=$(docker inspect "$(docker compose -f docker-compose.prod.yml ps -aq mongo)" \
  --format '{{range .Mounts}}{{if eq .Destination "/data/db"}}{{.Name}}{{end}}{{end}}')
echo "Volume: $VOL"
```

→ `Volume: notification_service_mongo_data` aana chahiye. Khaali aaye to ruk jao.

```bash
docker run --rm -v "$VOL":/target -v "$PWD":/backup:ro alpine sh -c '
  tar -xzf /backup/mongo_backup.tar.gz -C /target --strip-components=2 &&
  chown -R 999:999 /target && echo RESTORE_OK'
```

→ `RESTORE_OK`

```bash
docker compose -f docker-compose.prod.yml up -d mongo
sleep 25
docker compose -f docker-compose.prod.yml logs mongo | tail -20

docker compose -f docker-compose.prod.yml exec mongo \
  mongosh notification_service --quiet --eval 'db.getCollectionNames()'

docker compose -f docker-compose.prod.yml exec mongo \
  mongosh notification_service --quiet --eval 'db.adminusers.countDocuments()'
```

```bash
mkdir -p ~/backups
mv mongo_backup.tar.gz ~/backups/
chmod 600 ~/backups/mongo_backup.tar.gz
```

Galti ho gayi to reset:

```bash
docker compose -f docker-compose.prod.yml down
docker volume rm notification_service_mongo_data
```

---

## 6. SERVER — build + up + seed

```bash
cd /var/www/notification_service

docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
sleep 30
docker compose -f docker-compose.prod.yml ps

docker compose -f docker-compose.prod.yml --profile setup run --rm seed
curl -f http://localhost:5000/health && echo " HEALTH_OK"
```

Verify:

```bash
docker compose -f docker-compose.prod.yml exec api printenv \
  | grep -E "NODE_ENV|PORT|MONGODB_URI|REDIS_URL|ADMIN_DEFAULT_EMAIL|FRONTEND_URL"

docker compose -f docker-compose.prod.yml exec api \
  node -e "console.log(process.env.CREDENTIAL_ENCRYPTION_KEY.length)"
```

Admin password reset:

```bash
docker compose -f docker-compose.prod.yml exec api node -e "
const bcrypt=require('bcryptjs'),m=require('mongoose');
(async()=>{await m.connect(process.env.MONGODB_URI);
const r=await m.connection.collection('adminusers').updateOne(
  {email:process.env.ADMIN_DEFAULT_EMAIL},
  {\$set:{passwordHash:await bcrypt.hash(process.env.ADMIN_DEFAULT_PASSWORD,12)}});
console.log('matched',r.matchedCount,'modified',r.modifiedCount);process.exit(0)})()"
```

---

## 7. SERVER — nginx + SSL

```bash
DOMAIN=notify-api.mesmi.co.in
dig +short $DOMAIN

sudo apt install -y nginx certbot python3-certbot-nginx

sudo tee /etc/nginx/sites-available/notify-api >/dev/null <<'EOF'
server {
    listen 80;
    server_name __DOMAIN__;
    location / {
        proxy_pass         http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
EOF

sudo sed -i "s|__DOMAIN__|$DOMAIN|" /etc/nginx/sites-available/notify-api
sudo ln -sf /etc/nginx/sites-available/notify-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d "$DOMAIN"
curl -f "https://$DOMAIN/health" && echo " LIVE"
```

```bash
cd /var/www/notification_service
echo "API_BIND=127.0.0.1" >> .env
docker compose -f docker-compose.prod.yml up -d api
curl -f "https://$DOMAIN/health" && echo " STILL_LIVE"
```

---

## 8. SERVER — backup cron

```bash
mkdir -p ~/backups

cat > ~/backup-mongo.sh <<'EOF'
#!/bin/bash
set -e
cd /var/www/notification_service
docker compose -f docker-compose.prod.yml exec -T mongo \
  mongodump --db=notification_service --archive --gzip \
  > /home/deploy/backups/mongo_$(date +%F_%H%M).archive.gz
find /home/deploy/backups -name 'mongo_*.archive.gz' -mtime +7 -delete
EOF

chmod +x ~/backup-mongo.sh
~/backup-mongo.sh && ls -lh ~/backups/

( crontab -l 2>/dev/null; echo "0 3 * * * /home/deploy/backup-mongo.sh" ) | crontab -
crontab -l
```

Restore:

```bash
cd /var/www/notification_service
docker compose -f docker-compose.prod.yml exec -T mongo \
  mongorestore --archive --gzip --drop < ~/backups/mongo_2026-08-07_0300.archive.gz
docker compose -f docker-compose.prod.yml restart api worker
```

---

## 9. GitHub secrets

| Secret | Value |
|---|---|
| `VPS_HOST` | `<SERVER_IP>` |
| `VPS_USERNAME` | `deploy` |
| `VPS_PORT` | `22` |
| `APP_DIR` | `/var/www/notification_service` |
| `VPS_SSH_KEY` | login wali private key |

```powershell
cd D:\notification
git commit --allow-empty -m "Trigger deploy"
git push origin main
```

```bash
cd /var/www/notification_service
git log --oneline -1
docker compose -f docker-compose.prod.yml ps
curl -f https://notify-api.mesmi.co.in/health
```

---

## Rozana

```bash
cd /var/www/notification_service

docker compose -f docker-compose.prod.yml logs -f api worker
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml restart api
docker compose -f docker-compose.prod.yml build && docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml down
docker stats --no-stream
df -h
```

---

## Full sequence

```bash
# LOCAL
git push origin main

# SERVER root
adduser deploy && usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy/
curl -fsSL https://get.docker.com | sh && usermod -aG docker deploy
apt install -y git
mkdir -p /var/www && chown deploy:deploy /var/www
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile

# SERVER deploy
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N "" && cat ~/.ssh/id_ed25519.pub
cd /var/www && git clone git@github.com:SKC-INFOTECH-SOFTWARE/notification_service_backend.git notification_service
cd /var/www/notification_service

# LOCAL → SERVER
scp .env mongo_backup.tar.gz deploy@<SERVER_IP>:/var/www/notification_service/

# SERVER backup apply
chmod 600 .env
docker compose -f docker-compose.prod.yml create mongo
VOL=$(docker inspect "$(docker compose -f docker-compose.prod.yml ps -aq mongo)" \
  --format '{{range .Mounts}}{{if eq .Destination "/data/db"}}{{.Name}}{{end}}{{end}}')
docker run --rm -v "$VOL":/target -v "$PWD":/backup:ro alpine sh -c \
  'tar -xzf /backup/mongo_backup.tar.gz -C /target --strip-components=2 && chown -R 999:999 /target'
docker compose -f docker-compose.prod.yml up -d mongo && sleep 25
docker compose -f docker-compose.prod.yml exec mongo mongosh notification_service --quiet --eval 'db.getCollectionNames()'
mkdir -p ~/backups && mv mongo_backup.tar.gz ~/backups/

# SERVER build + up
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml --profile setup run --rm seed
curl -f http://localhost:5000/health

# SERVER nginx
sudo certbot --nginx -d notify-api.mesmi.co.in
echo "API_BIND=127.0.0.1" >> .env && docker compose -f docker-compose.prod.yml up -d api
```
