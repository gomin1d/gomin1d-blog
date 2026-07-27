---
title: "Як в debian 11 зробити sftp-директорію з іншого хоста через autofs sshfs"
date: "2023-07-08 02:37:10.127024"
tags: ["linux"]
draft: false
---
Іноді виникає задача з'єднати файлові системи двух хостів з системою debian. А саме створити таку директорію, яка буде містити файли з іншого хоста. Я для цієї задачи використовую autofs sshfs. 

З'єднуємося з хостом по ssh, на якому треба створити директорію. Виконуємо таку команду для встановлення пакетів autofs та sshfs:
```shell
apt install sshfs autofs
```

Далі виконуємо такі команди для налаштування з'єднання sftp:
```shell
cat > /etc/auto.master.d/sshfs.autofs <<EOF
/mnt /etc/auto.sshfs --timeout=30,--ghost
EOF
```

Далі створюємо sftp-директорію такими командами:
```shell
cat > /etc/auto.sshfs <<EOF
example-directory -fstype=fuse,port=22,rw,nodev,noatime,allow_other,max_read=65536,StrictHostKeyChecking=no,IdentityFile=~/.ssh/example_rsa :sshfs\#example-user@example-host\:
EOF
chmod 600 ~/.ssh/example_rsa
service autofs restart
```
Замість `example-directory` вкажіть бажане ім'я директорії.  
Замість `~/.ssh/example_rsa` вкажіть шлях до ssh-ключу.  
Замість `example-user@example-host` вкажіть ім'я користувача та айпі іншого хоста.

Директорія буде створена за шляхом `/mnt/example-directory/`.

Таким чином можна створювати безліч директорій у конфігу /etc/auto.sshfs.

---

_Опубліковано на Discourse: 2023-07-08 02:37:10.127024 UTC_
