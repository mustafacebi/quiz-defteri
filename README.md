# Quiz Defteri

BT Etiği dersinin 10 bölümü için ~750 soruluk çalışma ve deneme sitesi.
Eski bir defter görünümünde: ceviz masa, sararmış kâğıt, sayfası kıvrılarak çevrilen kitap.

Site: https://mustafacebi.github.io/quiz-defteri/

## Soruları güncellemek

Sorular `kaynak/*.txt` dosyalarından üretilir. Bir soruyu düzeltmek için:

1. `kaynak/` içindeki ilgili `.txt` dosyasını düzenle.
2. Proje klasöründe çalıştır: `python3 tools/convert.py`
3. Rapordaki **SORUNLAR** bölümü "yok" olmalı.

`data/questions.js` elle düzenlenmez; her seferinde script tarafından yeniden yazılır.

## Dokular

`img/` içindeki kâğıt, ahşap ve deri dokuları `python3 tools/textures.py` ile üretilir
(numpy ve Pillow gerekir). Dışarıdan alınmış görsel yoktur.

## Kullanılan kütüphane

Sayfa çevirme efekti: [StPageFlip](https://github.com/Nodlik/StPageFlip) (MIT), `js/vendor/` içinde.

## Yerelde açmak

`index.html` dosyasına çift tıklaman yeterli; sunucu gerekmez.
