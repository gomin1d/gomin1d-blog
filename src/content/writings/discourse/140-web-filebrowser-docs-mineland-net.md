---
title: "Бекап статті “Установка web сервера filebrowser” з docs.mineland.net"
date: "2023-06-28 03:54:31.639787"
tags: ["backup"]
draft: false
---
Файловый браузер - это web сервер, через который можно получить доступ к файлами на хосте. Доступ можно настроить к отдельным папкам для отдельных пользователей.

Файловый браузер работает на базе https://filebrowser.org/.

![image|690x364](/discourse-uploads/36c516257a9cc833134bf3a10dc8f07cab59efab.png)

## Установка web сервера filebrowser

Подключаемся по ssh к хосту, на котором находятся файлы, доступ к которым нужно осуществить.

Если файловый браузер `filebrowser` уже установлен, тогда этот шаг можно пропустить. Чтобы это проверить, мы можем воспользоваться командой:
```shell
filebrowser version
```
Если такая команда не найдена, значит необходимо выполнить установку.

Скрипт установки `filebrowser`:
```shell
curl -fsSL https://raw.githubusercontent.com/filebrowser/get/master/get.sh | bash
filebrowser
```

Нажимаем Ctrl+С, чтобы остановить filebrowser, и продолжаем установку:

```shell
mkdir -p /etc/filebrowser
mkdir -p /var/lib/filebrowser/base

filebrowser config set --address 0.0.0.0
mv filebrowser.db /var/lib/filebrowser

cat > /etc/filebrowser/.filebrowser.yml <<EOF
database: /var/lib/filebrowser/filebrowser.db
address: 0.0.0.0
port: 8090
root: /var/lib/filebrowser/base
EOF

cat > /etc/systemd/system/filebrowser.service <<EOF
[Unit]
Description=File browser
After=network.target

[Service]
User=root
Group=root
ExecStart=/usr/local/bin/filebrowser

[Install]
WantedBy=multi-user.target
EOF
```

Запускаем службу:
```shell
systemctl daemon-reload
systemctl start filebrowser
systemctl enable filebrowser
systemctl status filebrowser
```

Если все сделали правильно, тогда служба должна запуститься успешно, а ее вывод должен быть таким:
```
Dec 21 08:50:02 host4.mineland.local systemd[1]: Started File browser.
Dec 21 08:50:02 host4.mineland.local filebrowser[14701]: 2020/12/21 08:50:02 Using config file: /etc/filebrowser/.filebrowser.yml
Dec 21 08:50:02 host4.mineland.local filebrowser[14701]: 2020/12/21 08:50:02 Listening on [::]:8090
```

Если все хорошо, переходим в браузере по адресу http://айпи_хоста:8090/, авторизируемся под логином `admin` и паролем `admin`. В настройках профиля нужно поменять пароль и сохранить его в keepass.

### Проксируем filebrowser за NAT

Чтобы не афишировать айпи адрес хоста, где установлен `filebrowser`, можно проксировать его через прокси хост.

Для этого подключаемся по ssh к прокси хосту и создаем на нем такие iptables правила:
```shell
iptables -t nat -A PREROUTING -p tcp --dport 8091 -j DNAT --to-destination айпи_хоста:8090
iptables -t nat -A POSTROUTING -p tcp --dport 8090 -j SNAT --to-source айпи_прокси_хоста
```
В данном примере используется порт `8091` на прокси-хосте, но такой порт может быть уже занят. Проверить занятость порта можно такими командами:
```
netstat -tnlp | grep :8091
iptables -vnL -t nat --line-numbers | grep 8091
```
Если эти команды дали какой-то вывод, значит такой порт занят, и нужно выбрать любой другой.

Пробуем подключиться через браузер к прокси хосту по адресу http://айпи_прокси_хоста:8091/.

Если все работает, тогда осталось поместить получившиеся iptables правила в файл `/etc/iptables/iptables.d/10-nat`, чтобы они сохранялись после перезагрузки системы. Пример такого файла:
```
*nat

# proxy 
-A PREROUTING -p tcp --dport 8091 -j DNAT --to-destination айпи_хоста:8090
-A POSTROUTING -p tcp --dport 8090 -j SNAT --to-source айпи_прокси_хоста

COMMIT
```

## Создание пользователя

Открываем `filebrowser` в браузере, авторизируемся под аккаунтом админки `admin`, пароль от него можно узнать у любого админа Mineland.

После входа в аккаунт, открываем настройки `Settings` и переходим во вкладку `User Management`. Напротив заголовка `Users` есть кнопка `New`, жмем на нее.

В форме создания юзера указываем имя пользователя `Username` и пароль `Password`. Также нужно настроить параметр `Scope`. В это поле нужно указать путь к папке, которая будет доступна для этого пользователя. Папки всех пользователей располагаются по пути `/var/lib/filebrowser/username`, например, для пользователя с именем `lokha` его папка будет `/var/lib/filebrowser/lokha`.

Дальше подключаемся по ssh к хосту, на котором мы создали пользователя. На этом хосте создаем папку, которую мы указали при создании пользователя:
```shell
mkdir -p /var/lib/filebrowser/base/username
```

Пользователь он не сможет покинуть пределы этого каталога.

На данном этапе уже можно подключиться через filebrowser под созданным пользователем. Но его домашний каталог пока что пуст. Чтобы выдать доступ к конкретным каталогам, нужно воспользоваться командой `ln -s каталог/ символическая_ссылка/`:
```shell
# добавляем первый каталог
ln -s /home/mcraft/servers/creative /var/lib/filebrowser/base/username/server-creative

# добавляем второй каталог
ln -s /home/mcraft/servers/skyblock /var/lib/filebrowser/base/username/server-skyblock

# так можно добавлять сколько угодно каталогов
```

В качестве примера были добавлены две папки. Поскольку пользователь не может покинуть свою папку `/var/lib/filebrowser/base/username/`, нельзя выдать ему доступ напрямую к папкам каталогам извне. По этому мы создали точки символические ссылки внутри папки пользователя `server-creative/` и `server-skyblock/`, которые ведут на конкретные папки `/home/mcraft/servers/creative/` и `/home/mcraft/servers/skyblock/`. 

Чтобы пользователь мог редактировать файлы в добавленных папках, нужно выполнить этот скрипт:
```shell
# файлам и каталогам добавляем права на публичное редактирование
find -L /var/lib/filebrowser/base/*/** -type f -print0|xargs -0 chmod +666
find -L /var/lib/filebrowser/base/*/** -type d -print0|xargs -0 chmod 777

# добавляем acl правила, которые будут для новых файлов и каталогов 
# ставить права на публичное редактирование по умолчанию
setfacl -L -R -d -m u::rwX -m g::rwX -m o::rwX /var/lib/filebrowser/base/*/**
```

> Протестить, работает ли изменение прав по символическим ссылкам.

---

_Опубліковано на Discourse: 2023-06-28 03:54:31.639787 UTC_
