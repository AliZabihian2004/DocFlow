<div dir="rtl" align="right">

# راهنمای نصب Docflow

Docflow یک برنامه دسکتاپ آفلاین برای تبدیل فایل‌های PDF به Markdown است و از زبان فارسی و متن‌های راست‌به‌چپ پشتیبانی می‌کند.

برای مشاهده نسخه انگلیسی این راهنما، به [README انگلیسی](../README.md) مراجعه کنید.

## وضعیت انتشار

فایل‌های نصب پس از اجرای موفق فرایند انتشار در صفحه Releases قرار می‌گیرند. اگر هنوز فایلی برای سیستم‌عامل شما وجود ندارد، انتشار نسخه هنوز کامل نشده است؛ در این حالت می‌توانید برنامه را از سورس کد بسازید.

</div>

<div dir="ltr">

[صفحه دریافت نسخه‌ها در GitHub](https://github.com/AliZabihian2004/DocFlow/releases)

</div>

<div dir="rtl" align="right">

## نصب در ویندوز

**پیش‌نیاز:** Windows 10 یا نسخه جدیدتر، ۶۴ بیتی.

1. در صفحه Releases فایل `Docflow Setup 0.1.0.exe` را دانلود کنید.
2. فایل نصب را اجرا کنید.
3. ممکن است Windows SmartScreen هشدار «Windows protected your PC» را نمایش دهد. روی **More info** و سپس **Run anyway** کلیک کنید.
4. محل نصب را انتخاب کنید و روی **Install** کلیک کنید.
5. برنامه را از منوی Start یا میان‌بر دسکتاپ اجرا کنید.

برای حذف برنامه، به مسیر **Settings → Apps → Installed apps → Docflow → Uninstall** بروید. فایل‌ها و تنظیمات شخصی شما حذف نمی‌شوند.

</div>

<div dir="ltr">

> Docflow is currently unsigned. Windows may show a security warning the first time you run it.

</div>

<div dir="rtl" align="right">

## نصب در macOS

**پیش‌نیاز:** macOS 11 Big Sur یا نسخه جدیدتر. هر دو معماری Intel و Apple Silicon پشتیبانی می‌شوند.

1. برای رایانه‌های Intel فایل `Docflow-0.1.0.dmg` و برای Apple Silicon فایل `Docflow-0.1.0-arm64.dmg` را دانلود کنید.
2. فایل DMG را باز کنید و برنامه Docflow را به پوشه Applications بکشید.
3. چون برنامه امضای دیجیتال و notarization ندارد، بار اول روی برنامه دوبار کلیک نکنید. روی آن راست‌کلیک کنید، **Open** را انتخاب کنید و در پنجره بعدی دوباره **Open** را بزنید.
4. اگر macOS همچنان مانع اجرا شد، در Terminal دستور زیر را اجرا کنید:

</div>

<div dir="ltr">

```bash
xattr -dr com.apple.quarantine /Applications/Docflow.app
```

</div>

<div dir="rtl" align="right">

برای حذف برنامه، Docflow.app را به Trash منتقل کنید. تنظیمات برنامه در پوشه زیر باقی می‌ماند:

</div>

<div dir="ltr">

```text
~/Library/Application Support/Docflow
```

</div>

<div dir="rtl" align="right">

## نصب در Linux

**پیش‌نیاز:** سیستم‌عامل ۶۴ بیتی با glibc نسخه 2.31 یا جدیدتر؛ برای مثال Ubuntu 20.04 یا جدیدتر و Debian 11 یا جدیدتر.

### AppImage

1. فایل `Docflow-0.1.0.AppImage` را از صفحه Releases دانلود کنید.
2. فایل را اجرایی کنید و اجرا نمایید:

</div>

<div dir="ltr">

```bash
chmod +x Docflow-0.1.0.AppImage
./Docflow-0.1.0.AppImage
```

</div>

<div dir="rtl" align="right">

اگر به دلیل FUSE اجرا نشد، FUSE را نصب کنید یا فایل را استخراج نمایید:

</div>

<div dir="ltr">

```bash
sudo apt install libfuse2
./Docflow-0.1.0.AppImage --appimage-extract
./squashfs-root/AppRun
```

</div>

<div dir="rtl" align="right">

### Debian و Ubuntu

فایل DEB را با دستور زیر نصب کنید:

</div>

<div dir="ltr">

```bash
sudo apt install ./docflow_0.1.0_amd64.deb
docflow
```

</div>

<div dir="rtl" align="right">

برای حذف برنامه:

</div>

<div dir="ltr">

```bash
sudo apt remove docflow
```

</div>

<div dir="rtl" align="right">

تنظیمات برنامه در `~/.config/Docflow` قرار می‌گیرد.

## نصب Tesseract برای فایل‌های اسکن‌شده

برای PDFهایی که لایه متن قابل انتخاب دارند، نصب Tesseract لازم نیست. برای OCR فایل‌های اسکن‌شده باید Tesseract و بسته زبان فارسی (`fas`) را نصب کنید. بسته زبان انگلیسی (`eng`) نیز برای اسناد ترکیبی پیشنهاد می‌شود.

### ویندوز

از [نسخه‌های UB Mannheim](https://github.com/UB-Mannheim/tesseract/wiki) فایل نصب Tesseract را دریافت کنید. هنگام نصب، در بخش **Additional language data** زبان‌های **Persian (fas)** و **English (eng)** را انتخاب کنید.

سپس در یک Terminal جدید بررسی کنید:

</div>

<div dir="ltr">

```bash
tesseract --list-langs
```

</div>

<div dir="rtl" align="right">

اگر Tesseract در PATH نباشد، Docflow مسیرهای معمول ویندوز را نیز بررسی می‌کند. همچنین می‌توانید مسیر آن را از بخش **Settings → Tesseract location** مشخص کنید.

### macOS

</div>

<div dir="ltr">

```bash
brew install tesseract tesseract-lang
```

</div>

<div dir="rtl" align="right">

### Debian و Ubuntu

</div>

<div dir="ltr">

```bash
sudo apt install tesseract-ocr tesseract-ocr-fas tesseract-ocr-eng
```

</div>

<div dir="rtl" align="right">

### Fedora

</div>

<div dir="ltr">

```bash
sudo dnf install tesseract tesseract-langpack-fas
```

</div>

<div dir="rtl" align="right">

## ساخت از سورس کد

اگر فایل نصب سیستم‌عامل شما هنوز در صفحه Releases موجود نیست، می‌توانید برنامه را از سورس بسازید. راهنمای کامل انگلیسی در بخش [Building from source](../README.md#building-from-source) قرار دارد.

</div>

<div dir="ltr">

```bash
git clone https://github.com/AliZabihian2004/DocFlow.git
cd DocFlow
npm install
npm run dev
```

</div>

<div dir="rtl" align="right">

برای ساخت فایل قابل انتشار، ابتدا باید sidecar پایتون را در همان سیستم‌عاملی که قصد ساخت آن را دارید کامپایل کنید؛ PyInstaller امکان cross-compile ندارد.

</div>

<div dir="ltr">

```bash
bash build-scripts/build-sidecar-win.sh   # Windows (Git Bash)
bash build-scripts/build-sidecar-mac.sh   # macOS
bash build-scripts/build-sidecar-linux.sh # Linux
```

</div>

<div dir="rtl" align="right">

سپس دستور ساخت مربوط به سیستم‌عامل خود را اجرا کنید:

</div>

<div dir="ltr">

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

</div>

<div dir="rtl" align="right">

خروجی ساخت در پوشه `release/` قرار می‌گیرد.

</div>
