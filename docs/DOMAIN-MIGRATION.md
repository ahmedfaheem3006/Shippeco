# نقل الموقع العام من shippeco.com إلى shippec.com

## تحديث: وجهة النشر الفعلية (مُثبتة)

- الموقع يُخدم الآن من `https://shippec.com`، وحساب FTP هو نفسه (`2.57.89.35` / `u909097244`).
- جذر FTP هو مجلد الحساب (فيه `domains/` فقط)، ومجلد موقع shippec.com هو
  **`domains/shippec.com/public_html/`** — «public_html» في hPanel نسبي لمجلد الدومين.
  ثبت ذلك بـ `.github/workflows/ftp-diagnose.yml`: `index.html` في هذا المجلد هو نفسه الذي
  يقدمه https://shippec.com.
- النشر كان يذهب إلى `domains/shippeco.com/public_html/` (مجلد الدومين القديم)، فكان GitHub
  Actions ينجح بينما shippec.com يعرض نسخة قديمة نُسخت وقت النقل. تم تصحيح `server-dir`
  وملف التتبع أصبح `.ftp-deploy-shippec-state.json`.
- كل نشر: يأخذ نسخة احتياطية من المجلد الحالي كـ artifact (30 يومًا)، ثم يتحقق بعد الرفع أن
  `https://shippec.com/version.json` يطابق الـcommit المبني، وأن ملفات JS/CSS والـcanonical
  و`/login` (200) ومسار غير موجود (404) صحيحة — وإلا يفشل التشغيل.
- للرجوع: نزّل artifact باسم `site-backup-before-<sha>` من تشغيل النشر وارفع محتواه إلى نفس
  المجلد، أو أعد تشغيل النشر على commit سابق سليم.

> **الحالة:** لم يتم النقل. هذا المستند خطة تنفيذ قابلة للرجوع، والكود مجهّز لها
> بحيث يتم التبديل بمتغير واحد. لم يكن هناك وصول إلى لوحة Hostinger أو DNS أثناء
> التجهيز، لذلك كل الخطوات الخاصة بالاستضافة أدناه لم تُنفَّذ بعد.

## 1. ما تم تجهيزه في الكود (بدون أي أثر على الموقع الحالي)

| العنصر | المكان | السلوك الافتراضي |
|---|---|---|
| إعداد مركزي للنطاق العام | `src/config/publicSite.ts` (المتغير `VITE_PUBLIC_SITE_ORIGIN`) | `https://shippeco.com` |
| canonical / Open Graph / Twitter | `scripts/prerender.mjs` يقرأ نفس المتغير | يتبع المتغير |
| robots.txt و sitemap.xml | تُعاد كتابتهما في `dist/` أثناء البناء من نفس المتغير | يتبع المتغير |
| البيانات المنظمة (JSON-LD) | `src/pages/PublicHomePage.tsx` | يتبع المتغير |
| workflow النشر | `.github/workflows/deploy-hostinger.yml` يمرّر `vars.VITE_PUBLIC_SITE_ORIGIN` | غير معرّف ⇒ النطاق الحالي |
| CORS في الـBackend | `Backend/src/config/cors.ts` يسمح مسبقًا بـ `shippec.com` و`www.shippec.com` | إضافة فقط |

تم التحقق محليًا: بناء بـ `VITE_PUBLIC_SITE_ORIGIN=https://shippec.com` يغيّر canonical وog:url
وJSON-LD وrobots.txt وsitemap.xml كلها إلى `https://shippec.com`، وبدونه تبقى كلها على
`https://shippeco.com`.

### ما لا يجب تغييره

- **عنوان الـAPI** (`VITE_API_URL` → Railway) لا علاقة له بالنطاق العام ولا يتغير.
- **Webhook الدفع** (`/api/paymob/webhook` على Railway) لا يتغير.
- **Socket.io** حاليًا `origin: '*'` في `Backend/src/utils/socket.ts` — لا يحتاج تعديلًا للنقل
  (يُفضَّل لاحقًا تقييده بنفس قائمة CORS، كتحسين أمني مستقل).
- لا استبدال شامل لكلمة `shippeco`: أسماء المستودعات، اسم خدمة Railway، البريد
  `info@shippec.com` / `cs@shippec.com`، وبيانات الفواتير التاريخية تبقى كما هي.

## 2. فحوص مطلوبة قبل أي تغيير (تحتاج وصول Hostinger)

1. **ملكية النطاقين** في نفس حساب Hostinger أم لا، ومن يملك DNS لكل منهما.
2. **ما الموجود حاليًا على shippec.com**: موقع قائم؟ (الموقع القديم فيه صفحات خدمات
   ورابط دفع `/checkout/`) — اجمع قائمة كل الروابط المفهرسة من Search Console أو
   `site:shippec.com` قبل الاستبدال.
3. **البريد**: `info@shippec.com` و`cs@shippec.com` يعملان على shippec.com — سجّل كل سجلات
   `MX` و`SPF (TXT)` و`DKIM` و`DMARC` الحالية حرفيًا قبل أي تعديل.
4. **SSL** للنطاقين وللصيغتين `www` وبدونها.
5. **النطاقات الفرعية** الموجودة على shippec.com (إن وجدت).

## 3. النسخ الاحتياطي (قبل الاستبدال)

- نسخة كاملة من `public_html` الخاص بـ shippec.com + قاعدة بياناته إن وُجدت (Hostinger → Backups أو File Manager/FTP + phpMyAdmin export).
- تصدير لقطة من منطقة DNS لكلا النطاقين (كل السجلات).
- الاحتفاظ بنسخة من `domains/shippeco.com/public_html/` الحالية.

> ⚠️ لا تستخدم إجراء **Change Domain** في Hostinger لموقع shippec.com القائم: قد يحذف
> إعدادات البريد أو ينقل الملفات بطريقة لا يمكن الرجوع عنها بسهولة.

## 4. خطة النقل المقترحة (قابلة للرجوع)

1. **معاينة أولًا:** انشر نفس `dist/` على نطاق فرعي مؤقت (مثل `preview.shippec.com`) مبنيًا بـ
   `VITE_PUBLIC_SITE_ORIGIN=https://shippec.com` واختبر: الصفحة العامة، `/login`، لوحة
   النظام، إنشاء رابط دفع، فتح `/pay/:id`، إرسال طلب شحن/تواصل.
2. **اعتماد النسخة الأساسية:** `https://shippec.com` (بدون www)، مع تحويل `www` إليها.
3. **النشر على shippec.com:**
   - في GitHub → Settings → Variables: `VITE_PUBLIC_SITE_ORIGIN = https://shippec.com`.
   - في `deploy-hostinger.yml`: غيّر `server-dir` إلى مسار shippec.com الفعلي في
     Hostinger (مثلًا `./domains/shippec.com/public_html/`) و`state-name` لاسم جديد.
   - تأكد أن `public/.htaccess` (قواعد SPA وnoindex) وصل إلى المسار الجديد.
4. **التحويل 301 من النطاق القديم** — يوضع في `domains/shippeco.com/public_html/.htaccess`
   **فقط بعد** التأكد أن shippec.com يعمل بالكامل:

   ```apache
   RewriteEngine On
   # يحافظ على المسار والـquery string كما هي (QSA افتراضيًا مع [R]) — بدون حلقات،
   # وبدون تحويل كل الصفحات إلى الرئيسية.
   RewriteCond %{HTTP_HOST} ^(www\.)?shippeco\.com$ [NC]
   RewriteRule ^(.*)$ https://shippec.com/$1 [R=301,L]
   ```

   وعلى shippec.com، تحويل www إلى النسخة الأساسية:

   ```apache
   RewriteCond %{HTTP_HOST} ^www\.shippec\.com$ [NC]
   RewriteRule ^(.*)$ https://shippec.com/$1 [R=301,L]
   ```

5. **روابط الدفع القديمة:** روابط `https://shippeco.com/pay/<id>` المرسلة للعملاء (بما فيها
   المختصرة عبر is.gd) ستعمل لأن التحويل يحافظ على المسار ⇒ `https://shippec.com/pay/<id>`.
   الروابط الجديدة تأخذ نطاقها تلقائيًا من متصفح الموظف الذي أنشأها (`Origin`).
6. **صفحات الموقع القديم على shippec.com:** لكل رابط مفهرس قديم حدّد وجهة مقابلة
   (صفحة الخدمة ← `/#services` أو صفحة مستقبلية مخصصة، صفحة التواصل ← `/#visit`).
   لا تحوّل `/checkout/` إلى الواجهة الجديدة لأنه لا توجد صفحة دفع مقابلة بنفس
   المسار — اتركه على نسخته القديمة أو صفحة توضيحية حتى يتقرر بديله.
   *(القائمة الفعلية لم تُجمع — تحتاج Search Console/وصول للموقع القديم.)*
7. **تسجيل الدخول:** الجلسة محفوظة في `sessionStorage` لكل نطاق، فسيحتاج الموظفون لتسجيل
   الدخول مرة على النطاق الجديد. لا تُنقل أي tokens عبر روابط.
8. **Search Console:** أضف `https://shippec.com`، أرسل `sitemap.xml` الجديد، واستخدم
   أداة **Change of Address** من خاصية shippeco.com بعد تفعيل التحويل 301.

## 5. خطة الرجوع

- حذف قاعدة 301 من `.htaccess` الخاص بـ shippeco.com يعيد الموقع القديم فورًا.
- حذف متغير `VITE_PUBLIC_SITE_ORIGIN` وإعادة `server-dir` ثم إعادة النشر يعيد canonical وsitemap.
- استعادة نسخة `public_html` الاحتياطية لـ shippec.com ولقطة DNS عند الحاجة.

## 6. اختبارات ما بعد النقل

- [ ] `https://shippec.com/` يعرض المحتوى المُصيّر مسبقًا وcanonical = shippec.com.
- [ ] `http://`, `www.` و`shippeco.com/<أي مسار>?q=1` ⇒ تحويل 301 واحد إلى نفس المسار على shippec.com.
- [ ] `/login` ولوحة النظام وإرفاق الملفات تعمل (CORS بدون أخطاء).
- [ ] رابط دفع قديم `shippeco.com/pay/<id>` يفتح صفحة الدفع الصحيحة.
- [ ] Webhook الدفع ما زال يصل (لم يتغير).
- [ ] إرسال/استقبال بريد على `info@` و`cs@` بعد أي تعديل DNS.
- [ ] `robots.txt` و`sitemap.xml` يشيران إلى shippec.com.
