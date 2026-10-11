# Döner Tycoon Online

3D, üstten bakışlı, gerçek zamanlı çok oyunculu döner dükkânı. Tarayıcıdan (PC + Android) oynanır.

## Bu sürümde ne var? (Parça 1 + 2)

Çalışan:
- 3D Türk dönerci: döner ocağı (dönen et, buhar), kesme tezgâhı, ekmek/lavaş, malzeme istasyonu, patates, içecek dolabı, kasa, sipariş panosu, depo rafları, masalar, bekleme alanı, kayan cam kapı.
- Üstten hafif izometrik kamera: takip, sürükleyerek döndürme, tekerlek/çimdik zoom. Kameranın arkasında kalan duvar şeffaflaşır.
- WASD/ok tuşları, mobilde sanal joystick, çarpışma (duvar + mobilya), yürüme ve çalışma animasyonu.
- Gerçek Socket.IO sunucusu: oda oluşturma, 5 harfli oda kodu, davet bağlantısı (`/?oda=KOD`), 6 kişi sınırı, oyuncu listesi, giriş/çıkış bildirimi, sohbet, lider devri, yeniden bağlanma (30 sn).
- Hareket senkronu: istemci 15 Hz gönderir, sunucu doğrular (hız bütçesi + duvar içine girme kontrolü) ve odaya yayınlar. Diğer oyuncular yumuşatılarak çizilir.
- Etkileşim: istasyona yaklaşınca ipucu çıkar, E/butona basınca çalışma animasyonu oynar ve odadaki diğerleri bunu görür (sunucu mesafeyi doğrular).
- Grafik ayarı (Düşük/Orta/Yüksek), efekt kapatma, WebGL 2 kontrolü.

Henüz YOK (sonraki ZIP'lerde): sipariş sistemi, döner kesme mekaniği, ortak kasa/ekonomi, yükseltmeler, PostgreSQL kayıt, ses, müşteriler. İstasyonlarda şimdilik sadece animasyon var; oyun mantığı bağlı değil.

## Yerelde çalıştırma

1. Node.js 18.18+ kur (nodejs.org, LTS).
2. `npm install`
3. `npm start` ve tarayıcıda `http://localhost:3000`
4. İki sekme/tarayıcı aç: birinde oda kur, diğerinde kodla katıl.
5. Testler: `npm test` (mantık testleri bağımlılıksız çalışır; entegrasyon testleri `npm install` ister).

## Ortam değişkenleri (.env.example)

| Değişken | Anlamı |
|---|---|
| `PORT` | Render kendisi verir. Yerelde 3000. |
| `PUBLIC_SERVER_URL` | Boş bırak (frontend ve backend aynı serviste). Ayrı backend kullanırsan adresini yaz. |
| `CORS_ORIGIN` | Sadece frontend başka alan adındaysa. |

Gizli anahtar istemci koduna yazılmaz. Bu sürümde zaten gizli anahtar yok; veritabanı adresi gelince sadece sunucuda kullanılacak.

## GitHub'a telefondan yükleme (klasör sorunu için)

Telefon tarayıcısı klasör yüklemeyi desteklemez. Bu yüzden ZIP'i olduğu gibi yükleyip GitHub Actions'a actırıyoruz:

1. Boş bir repo oluştur.
2. "Add file → Create new file" ile dosya adına `.github/workflows/unzip.yml` yaz (eğik çizgiler klasör yaratır) ve sohbetteki YAML'ı yapıştırıp commit et.
3. "Add file → Upload files" ile ZIP'i repo köküne yükle, commit et.
4. Actions sekmesinde "Zip aç" çalışır; bitince dosyalar klasörleriyle repoda görünür. Çalışmazsa Actions → Zip aç → Run workflow.
5. Sonraki parçaların ZIP'lerini de aynı şekilde yükle; üzerine yazılır.

Not: Repo ayarlarında Settings → Actions → General → Workflow permissions "Read and write" olmalı.

## Render'a dağıtım (ücretsiz)

1. render.com → New → Web Service → GitHub reposunu bağla.
2. Ayarlar (render.yaml varsa otomatik gelir): Runtime Node, Build `npm install`, Start `npm start`, Plan Free, Health Check Path `/healthz`.
3. Deploy bitince `https://servis-adin.onrender.com` adresini aç. Render otomatik HTTPS verir; WebSocket ek ayar istemez (wss otomatik).
4. WebSocket doğrulama: sayfada alttaki "Sunucuya bağlı" yazısı yeşil olmalı. Tarayıcı geliştirici araçlarında Network → WS sekmesinde `socket.io` bağlantısı görünür.
5. Arkadaşların katılması: oda kurunca üstteki oda koduna dokun, bağlantıyı paylaş. Farklı internetten de aynı adresle girerler.
6. Loglar: Render panelinde servis → Logs.

### Ücretsiz plan uyarıları
- Servis ~15 dk işlem olmayınca uyur. İlk bağlantı 30-60 sn gecikebilir. Uyuyunca açık odalar silinir (oda belleğte tutulur).
- Ücretsiz veritabanları (Neon, Supabase vb.) depolama ve süre limitleri olabilir ve kalıcılık garantisi vermez. Kalıcı kayıt eklendiğinde limitler burada ayrıca yazılacak.

## Sorun giderme

- "Sunucuya ulaşılamıyor": Render servisi uyuyor olabilir, 1 dk bekle. Logs'a bak.
- Ekran siyah / "WebGL 2 desteklemiyor": tarayıcıyı güncelle, donanım hızlandırmayı aç.
- Telefonda yavaş: Menü → Grafik "Düşük", efektleri kapat.
- Oda kodu "bulunamadı": servis yeniden başladıysa odalar silinmiştir, yeni oda kur.

## Bilinen sınırlar (dürüst liste)

- Tarayıcıda hiç çalıştırılmadı; görsel ayarlar (ışık, kamera mesafesi) gerçek ekranda ince ayar isteyebilir.
- Gerçek FPS ölçülmedi, bir FPS garantisi verilmiyor.
- Oda durumu bellektedir; sunucu yeniden başlayınca odalar kaybolur.
