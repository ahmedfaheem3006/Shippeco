# المسارات وصفحة 404 على Hostinger

## كيف يعمل

| الطلب | ما يرجعه الخادم | الحالة |
|---|---|---|
| `/` | `index.html` (الصفحة الرئيسية المُصيّرة مسبقًا) | 200 |
| ملف موجود (`/assets/*.js`، الصور، `robots.txt`…) | الملف نفسه | 200 |
| مسار معروف في التطبيق (`/login`، `/dashboard`، `/pay/123`…) | `app.html` | 200 |
| أي شيء آخر (مسار غير معروف، أو ملف غير موجود مثل `/assets/x.js`) | `404.html` عبر `ErrorDocument` | **404**، والرابط يبقى كما هو |

- `dist/404.html` يُولَّد أثناء البناء من نفس مكوّن React (`src/pages/NotFoundPage.tsx`)،
  فالتصميم واحد في الحالتين، ويعمل بدون JavaScript. بعد تحميل JS تعرض React نفس الصفحة.
- الصفحة تضع `noindex` وعنوان «الصفحة غير موجودة | SHIPPEC» وتحذف canonical/og:url أثناء
  عرضها فقط، وتعيدها عند مغادرتها. غير موجودة في `sitemap.xml`.

## إضافة مسار جديد للتطبيق

1. أضف `<Route path="/new-page" ... />` في `src/App.tsx` (بصيغة `path="..."` الحرفية).
2. شغّل `npm run build` — `scripts/prerender.mjs` يقرأ المسارات من `App.tsx`
   (`scripts/app-routes.mjs`) ويكتب قواعدها في `dist/.htaccess` تلقائيًا، بما فيها المسارات
   الديناميكية (`/pay/:id` ← `^pay/[^/]+/?$`) ووسم `X-Robots-Tag: noindex`.
3. لا تعدّل القواعد المولَّدة داخل `dist/.htaccess` يدويًا، ولا تضف catch-all إلى `app.html`
   في `public/.htaccess` — ذلك يعيد مشكلة إرجاع 200 لأي رابط.

البناء يفشل عمدًا إذا لم يجد علامات التوليد في `.htaccess` أو وجد أقل من 5 مسارات، وworkflow
النشر يتحقق من وجود `404.html` و`app.html` والقواعد المولَّدة قبل الرفع.

## التحقق محليًا

`npm run build` ثم `node scripts/preview-static.mjs` — خادم يحاكي نفس القواعد المولَّدة
(ليس Apache/LiteSpeed نفسه). بعد النشر تحقق على الاستضافة الفعلية:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://shippec.com/random-missing-page   # 404
curl -s -o /dev/null -w "%{http_code}\n" https://shippec.com/login                 # 200
curl -s -o /dev/null -w "%{http_code}\n" https://shippec.com/pay/123               # 200
curl -s -o /dev/null -w "%{http_code}\n" https://shippec.com/assets/missing.js     # 404
```
