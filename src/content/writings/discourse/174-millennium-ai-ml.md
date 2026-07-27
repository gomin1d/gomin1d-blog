---
title: "Millennium AI/ML - личная модель машинного обучения"
date: "2024-11-28 13:21:10.20612"
tags: ["java"]
draft: false
---
**Вступление**
Сегодня (28.11.2024) началось тестирование первой beta-сборки модели машинного обучения Millennium, разработанного под работу с delta-based значениями (в основном для анти-читов).

Как и в других моделях, Millennium принимает табличные данные. На каждый столбец в таблице модель выделяет 4 типажа размышлений - от абстрактного до самого точного, что позволяет модели размышлять как человек. Сама работа с моделью выполнена максимально просто.

**Начинаем работу**
Можно держать даже несколько моделей,  но пока нам это не нужно...
Работа с моделью начинается через класс **FactoryML**, где можно:

1. Создать новую модель
2. Загрузить модель из файла (рекомендуется использовать при старте модели, если файл не найден, то создается просто новая модель)
3. Выгрузить модель с памяти.

А сама модель представлена в виде класса **ModelML**, давайте её получим:
```java
ModelML modelMl = FactoryML.loadFromFile(id, fileName);
```
*Если файл не найден, то загрузит пустую модель*

Заполним базовыми данными:
```java
ModelML modelMl = FactoryML.loadFromFile(0, model.dat);
```
*Файл модели хранится нативно в .dat.*

Теперь мы можем получить нашу модель этим методом:
```java
ModelML modelMl = FactoryML.getModel(0);
```
Дальше нужно работать с классом ModelML для обучения.

**Обучение**
Обучение начинается с метода в ModelML:
```
learnByData(List<ObjectML> o, boolean isMustBeBlocked)
```
**ObjectML** хранит в себе массив с числами Double, проще говоря 1 столбец (не менее 50 чисел).

**Мы можем обучать модель 2 вещам**:
1. То, что нормально ( isMustBeBlocked == false )
2. То, что должно быть заблокировано (  isMustBeBlocked == true )

Рекомендуется обучать с 1 по 2.

Давайте обучим модель по нашим поворотам yaw / pitch:

```java
boolean learning = true;
boolean hackLearning = false; // true - если обучаем модель тому, как поворачивает Killaura
if (this.rotations.size() >= 60) { // 60 чисел в столбце
   ObjectML yaw = new ObjectML(new ArrayList<>());
   ObjectML pitch = new ObjectML(new ArrayList<>());
   {
     for (Vec2 vec2 : this.rotations) {
     yaw.getValues().add(vec2.getX());
     pitch.getValues().add(vec2.getY());
   }
   if (learning) {
    FactoryML.getModel(0).learnByData(Arrays.asList(yaw, pitch), hackLearning);
    FactoryML.getModel(0).saveToFile("model.dat"); // сохранение модели
   }
}
```

При обучении в консоль будет выводиться что-то типо:
![image|690x304](/discourse-uploads/c9600ba372d82af05624b8dc2783150c0370a0c8.jpeg)

После обучения модели обычному поведению, ставим:
```java
boolean hackLearning = true;
```
И уже обучаем модель работе Killaura, используя разные читы.

**Рекомендую:**
*обучить модель не менее 2000 паттернов обычного поведения.*
*обучить модель не менее 300 паттернов читерского поведения.*

Дальше можно приступить к обнаружению читов.

**Обнаружение**
Мы обучили модель, у нас есть файл с моделью.
Теперь давайте регулярно передавать модели данные:
```java
if (this.rotations.size() >= 60) {
   ObjectML yaw = new ObjectML(new ArrayList<>());
   ObjectML pitch = new ObjectML(new ArrayList<>());
   {
     for (Vec2 vec2 : this.rotations) {
      yaw.getValues().add(vec2.getX());
      pitch.getValues().add(vec2.getY());
     }
     if (learning) { // Мы не обучаем модель
      FactoryML.getModel(0).learnByData(Arrays.asList(yaw, pitch), hackLearning);
      FactoryML.getModel(0).saveToFile("model.dat");
     } else { // Поэтому код будет выполняться здесь 
      ResultML resultML = FactoryML.getModel(0).checkData(Arrays.asList(yaw, pitch));
      // дальнейшие операции
     }
   }
}
```

В итоге мы получаем результат в **ResultML**:
```java
public int UNUSUAL; // Необычно (абстрактный уровень)
public int STRANGE; // Странно
public int SUSPECTED; // Подозрительно
public int SUSPICIOUSLY; // Обнаружено (точный уровень)
```
Мы можем получить эти значения с полученного класса ResultML, а дальше выводы уже делайте по ситуации. На каждый уровень возлагается свой VL.

**Это основы работы с моделью Millennium. Возможно, функционал будет дополняться.**

---

_Опубліковано на Discourse: 2024-11-28 13:21:10.20612 UTC_

## Коментарі з Discourse

**gomin1d — 2024-11-28 14:24:44.865594 UTC**

> Це перша стаття pawsashatoy, яку я повністю зрозумів. :cool:

---

**gomin1d — 2024-11-28 14:25:02.232024 UTC**

> Api моделі дійсно простий. Але не вказаний github/maven/gradle.

---

**pawsashatoy — 2024-11-28 14:29:53.320838 UTC**

> github будет потом. как и все прочее

---

**gomin1d — 2024-12-03 15:53:37.939453 UTC**

> @pawsashatoy можеш перевірити, наскільки вона буде краще за звичайний xgboost https://github.com/gomin1d/xgboost-example
