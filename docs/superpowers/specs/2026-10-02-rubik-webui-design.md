# Rubik WebUI local — Thiết kế (spec)

- Ngày: 2026-10-02
- Trạng thái: đã duyệt từng phần trong buổi brainstorming, chờ người dùng review bản viết
- Ảnh tham chiếu: `assets/IMG_2917.PNG`

## 1. Mục tiêu

Ứng dụng web chạy local (một file HTML, mở bằng Edge/Chrome, offline) để chơi và học Rubik 3×3:

- Khu chính: khối Rubik 3D xoay được (góc nhìn và từng lớp) + bên dưới là **một** sơ đồ 9 vòng giao nhau (như ảnh tham chiếu). Hai view đồng bộ hai chiều.
- Bảng bên phải 3 tab: **Ra đề** (theo cấp độ, luôn giải được), **Giải** (người dùng tô màu → thuật toán giải, hiện từng bước), **Thuật toán** (giải thích + code 5 ngôn ngữ).

## 2. Thuật ngữ chuyên ngành của sơ đồ vòng

Sơ đồ 9 vòng là một **biểu diễn đẳng cấu (isomorphic representation)** của Rubik 3×3 dưới dạng **circle puzzle / ring puzzle** (họ "vòng giao nhau", như Hungarian Rings). Về toán học đó là **biểu diễn hoán vị (permutation representation)** của **nhóm Rubik (Rubik's Cube group)** trên 54 **facelet**.

- 9 vòng = 3 họ (trục x, y, z) × 3 vòng đồng tâm (3 lát cắt mỗi trục).
- Mỗi vòng đi qua 12 facelet (12 ô quanh một lát cắt).
- Mỗi facelet (kể cả tâm) nằm trên đúng 2 lát cắt ⇒ mỗi chấm là giao của 2 vòng thuộc 2 họ khác nhau. Hai vòng giao nhau tại 2 điểm ⇒ mỗi cặp họ cho 18 chấm (2 mặt đối diện), tổng 54.
- 9 facelet của một mặt tạo một cụm quanh chấm tâm (giao của 2 vòng giữa).

Nguồn: [MelonGO/rubiks-cube-projection](https://github.com/MelonGO/rubiks-cube-projection), [Circle Puzzle – Lutz Hühnken](https://www.huehnken.de/games/circles/index.html), [SpeedSolving – 2D Rubik's cube](https://www.speedsolving.com/threads/2d-rubiks-cube.89846/), [Hutchings – The mathematics of Rubik's Cube](https://math.berkeley.edu/~hutching/rubik.pdf).

## 3. Quyết định đã chốt

| Chủ đề | Quyết định |
|---|---|
| Stack | TypeScript thuần + Three.js (WebGL) + SVG, Vite + `vite-plugin-singlefile`, Vitest |
| Dependency lúc chạy | Chỉ `three` |
| Phân phối | Một file `dist/index.html`, double-click mở được qua `file://`, offline hoàn toàn |
| Sơ đồ phẳng | Một sơ đồ 9 vòng duy nhất |
| Tương tác | Kéo trên khối 3D, bàn phím ký hiệu, nút keycap, click vòng trên sơ đồ |
| Cấp độ đề | Kết hợp: theo khoảng cách đo được + random-state + luyện giai đoạn |
| Thuật toán giải | Cả Kociemba 2 pha ("Ngắn nhất") và Layer-by-Layer ("Từng tầng") |
| Nhập màu Tab 2 | Lưới chữ thập 2D trong tab (+ nút "Lấy từ khối hiện tại") |
| Tab 3 | Đoạn code cốt lõi chuyển 5 ngôn ngữ + file đầy đủ tải về |
| Ngôn ngữ UI | Song ngữ VI/EN |
| Theme | Tối + sáng, theo hệ điều hành, có nút chuyển |
| Code/comment/commit | Tiếng Anh |
| Kiểm thử | Vitest cho logic lõi (TDD); UI kiểm thủ công; 5 file mẫu bắt buộc chạy và khớp kết quả |
| Tài liệu agent | CLAUDE.md (ngữ cảnh), AGENTS.md (luật), DESIGN.md (thiết kế, chuẩn Stitch) |

Toolchain đã kiểm tra trên máy: Node 22.14, Python 3.12.9, g++ 15.2 (MSYS2), .NET 9, Java 11.0.18, git 2.53.

## 4. Kiến trúc

### 4.1 Mô hình lõi

- Trạng thái: `Uint8Array(54)`, thứ tự facelet chuẩn Kociemba `U R F D L B`, mỗi mặt 9 ô đọc từ trái-trên.
- Mỗi phép xoay (`U D R L F B`, `M E S`, `x y z`, kèm `'` và `2`) là một hoán vị 54 phần tử tính sẵn; `apply(state, move)` = tra bảng.
- `cubie.ts`: chuyển facelet ↔ cubie (8 góc: hoán vị + hướng; 12 cạnh: hoán vị + hướng) và kiểm tra hợp lệ.

### 4.2 Ánh xạ vòng (`core/rings.ts`)

| Họ | Vòng ngoài | Vòng giữa | Vòng ngoài (đối diện) |
|---|---|---|---|
| y | U | E | D |
| x | R | M | L |
| z | F | S | B |

- Mỗi vòng = danh sách 12 chỉ số facelet có thứ tự. Quay lớp = dịch vòng 3 nấc; với lớp mặt (U, R…) thì 8 facelet của mặt đó cũng hoán vị trong cụm của nó.
- Hình học: tâm 3 họ đặt cách gốc một khoảng `d`, lệch nhau 120°; 3 bán kính tăng dần. Toạ độ 54 chấm = giao điểm vòng–vòng, gán vào facelet theo ánh xạ.
- Click vòng = xoay lớp tương ứng theo chiều kim đồng hồ; Shift+click = ngược chiều.

### 4.3 Thư mục

```
src/
  core/      cube.ts  cubie.ts  rings.ts  prng.ts
  solver/    kociemba.ts  lbl.ts  worker.ts
  scramble/  levels.ts  mitm.ts
  view/      cube3d.ts  rings2d.ts  net.ts
  ui/        tabs/  i18n/{vi,en}.json  content/{vi,en}/  theme.css
  store.ts   main.ts
reference/   python/  cpp/  csharp/  java/  js/  fixtures.json  verify script
docs/superpowers/specs/
CLAUDE.md  AGENTS.md  DESIGN.md
```

### 4.4 Luồng dữ liệu

Mọi input (kéo khối, phím, nút, click vòng, phát lời giải) → `store.enqueue(move)` → **một** animation driver (`requestAnimationFrame`) cấp tiến độ `t ∈ [0,1]` cho cả `cube3d` và `rings2d` → xong nước: `state = apply(state, move)` → subscriber vẽ lại. View không sửa state, không gọi nhau.

Hàng đợi tối đa 50 nước. Thao tác tay trong lúc phát lời giải sẽ tạm dừng việc phát.

### 4.5 Worker

Bộ giải và bộ sinh đề chạy trong Web Worker (đóng gói inline vào file HTML). Bảng tra Kociemba dựng khi khởi động (có thanh tiến trình) và cache vào IndexedDB nếu có; không có thì dựng lại mỗi lần mở.

## 5. Bộ giải

### 5.1 Kociemba 2 pha

- Pha 1 → G1 = ⟨U, D, R2, L2, F2, B2⟩, toạ độ: twist (2187), flip (2048), UD-slice (495).
- Pha 2 trong G1, toạ độ: corner perm (40320), UD-edge perm (40320), slice perm (24).
- Bảng move + 4 bảng pruning (~4 MB). IDA* với thứ tự duyệt nước cố định.
- Dừng tất định, giới hạn theo **số nút duyệt**, không theo thời gian:
  - Tìm được lời giải rồi thì vẫn tiếp tục rút ngắn, cho tới khi:
    - đã ≤ 21 nước (HTM) **và** đã duyệt đủ 200.000 nút; hoặc
    - độ sâu pha 1 đã bằng độ dài lời giải tốt nhất (không thể ngắn hơn nữa); hoặc
    - chạm trần 30 triệu nút.
  - Các ngân sách chỉ áp dụng sau khi đã có lời giải đầu tiên, nên luôn có kết quả (≤ 30 nước).
  - Nhờ vậy khối chỉ cách đích 1 nước (`R`) nhận đúng lời giải `R'`, thay vì lời giải đường vòng 8 nước khi dừng ngay ở lời giải ≤ 21 đầu tiên.

### 5.2 Layer-by-Layer

7 giai đoạn có tên và lời giải thích (VI/EN):

1. Chữ thập trắng
2. Góc tầng 1
3. Cạnh tầng 2
4. Chữ thập vàng
5. Xếp cạnh vàng
6. Đặt vị trí góc vàng
7. Xoay góc vàng

Mỗi giai đoạn: tìm khối → nhận dạng trường hợp → áp công thức cố định. Cuối mỗi giai đoạn có assert bất biến. Kết quả trả về theo nhóm giai đoạn.

## 6. Sinh đề (Tab 1)

Bất biến chung: không bao giờ sinh đề không giải được. Đề dạng chuỗi xáo bắt đầu từ trạng thái đã giải; đề dạng trạng thái phải thỏa 3 bất biến (tổng twist ≡ 0 mod 3, tổng flip chẵn, parity góc = parity cạnh) và qua bộ kiểm tra hợp lệ (assert).

Đo khoảng cách bằng **meet-in-the-middle**: dựng sẵn tập trạng thái cách đích ≤ 5 (~620k, băm theo toạ độ cubie), rồi mở rộng ≤ 4 bước từ đề ⇒ khoảng cách chính xác tới 9.

| Cấp | Cách sinh | Bảo đảm |
|---|---|---|
| Làm quen | Chuỗi xáo chuẩn tắc (không có nước tự triệt tiêu) | Khoảng cách chính xác 1–2 |
| Dễ | như trên | 3–5 |
| Trung bình | như trên | 6–9 |
| Khó | Chuỗi xáo 10–14 nước | Chứng minh khoảng cách ≥ 10 |
| Chuyên gia | Random-state (WCA): hoán vị và hướng ngẫu nhiên thỏa bất biến → đảo lời giải Kociemba thành chuỗi xáo | Như đề WCA |
| PLL | Trạng thái đã giải trừ hoán vị tầng cuối (+AUF ngẫu nhiên) | Luôn giải được |
| OLL+PLL | Tầng cuối ngẫu nhiên thỏa bất biến | Luôn giải được |
| F2L+LL | Chữ thập trắng giữ nguyên, phần còn lại ngẫu nhiên thỏa bất biến | Luôn giải được |

Sai khoảng cách thì sinh lại. Tab 1 có đồng hồ (chạy từ nước đầu tiên sau khi xáo, dừng khi khối được giải) và bộ đếm nước.

## 7. Kiểm tra hợp lệ (Tab 2)

Lưới chữ thập → cubie, báo lỗi cụ thể (VI/EN) và tô viền đỏ các ô liên quan:

1. Một màu có số ô khác 9
2. Hai mặt trùng màu tâm
3. Khối góc/cạnh không tồn tại (tổ hợp màu sai hoặc có màu đối diện)
4. Khối bị trùng
5. Một góc bị vặn (twist ≠ 0 mod 3)
6. Một cạnh bị lật (flip lẻ)
7. Hai khối bị tráo chỗ (parity góc ≠ parity cạnh)

Nút *Giải* luôn bấm được; lưới sai thì hiện lỗi thay vì gọi bộ giải. Lời giải phát lại có lùi / phát / tới và tốc độ 0.5×–3×.

## 8. Giao diện

### 8.1 Bố cục (mockup đã duyệt)

- ≥ 1100px: 2 cột. Trái: khối 3D, thanh keycap (`U D R L F B M E S`, nút bật `'` và `2`), sơ đồ 9 vòng. Phải: panel 3 tab dạng pill.
- 760–1100px: panel phải rộng 340px.
- < 760px: một cột, các tab nằm dưới sơ đồ.
- Header: tên app, VI/EN, nút đổi theme, nút Đặt lại.
- Một CTA chính mỗi tab (*Tạo đề*, *Giải*); các nút khác là nút phụ.

### 8.2 Khối 3D

27 cubie bo góc + sticker phẳng; ánh sáng hemisphere + directional; không đổ bóng; nền canvas trong suốt; chỉ render khi animate hoặc khi kéo; pixel ratio tối đa 2. Kéo trên nền = xoay góc nhìn; kéo trên ô = raycast pháp tuyến + hướng kéo ⇒ lớp và chiều. Dùng Pointer Events (hỗ trợ cảm ứng).

### 8.3 Bàn phím

- `U D R L F B M E S x y z`; Shift = ngược chiều. Không dùng Alt (xung đột menu trình duyệt).
- Xoay đôi bằng nút bật `2`.
- `Ctrl+Z` / `Ctrl+Y` hoàn tác/làm lại, `Space` phát/dừng lời giải.
- Phím tắt tắt khi focus đang ở ô nhập.

### 8.4 Chuyển động

- Mỗi nước 1/4 vòng 220ms, nước đôi 330ms, easing `cubic-bezier(0.16,1,0.3,1)`.
- Chỉ animate `transform`/`opacity`.
- `prefers-reduced-motion`: đổi trạng thái tức thì.
- Chấm trên vòng trượt theo cung tròn; 8 chấm của mặt bị xoay di chuyển trong cụm.

### 8.5 Theme (token CSS trên `:root`, `[data-theme]` + `prefers-color-scheme`)

| Token | Tối | Sáng |
|---|---|---|
| canvas | `#0B0C0E` | `#F7F7F5` |
| surface | `#111214` | `#FFFFFF` |
| elevated | `#16181B` | `#F1F1EF` |
| selected | `#1B1D21` | `#E9E9E6` |
| hairline | `#23262A` | `#E4E4E0` |
| ring | `#34373C` | `#C9CBCF` |
| mute | `#6E727A` | `#6E727A` |
| body | `#C9CBCF` | `#3A3D42` |
| ink | `#F2F3F5` | `#16181B` |
| cta-bg / cta-fg | `#F2F3F5` / `#0B0C0E` | `#16181B` / `#F7F7F5` |
| success | `#59D499` | `#1F9D63` |
| danger | `#FF6161` | `#D93C3C` |
| warning | `#FFC533` | `#B7791F` |

Sticker (giống nhau ở cả hai theme): U `#F4F4F2`, D `#FFD23F`, F `#18B35A`, B `#1E6BFF`, R `#E0352B`, L `#FF8A1F`; thân nhựa `#141518`. Ở theme sáng, chấm/ô trắng và vàng có thêm viền 1px.

Chiều sâu tạo bằng thang nền + viền 1px, không có drop shadow. Thông báo trạng thái dùng nền màu trạng thái với độ đậm 12%.

### 8.6 Chữ

Be Vietnam Pro (UI, 11/13/18px; 400/500/600) + JetBrains Mono (ký hiệu nước đi, đồng hồ, code). Chỉ lấy bộ ký tự Latin + tiếng Việt, nhúng woff2 (~150 KB).

### 8.7 Song ngữ

`ui/i18n/{vi,en}.json` + `t(key)`. Nội dung dài của Tab 3 nằm ở `ui/content/{vi,en}/`. Mặc định theo `navigator.language`; lựa chọn lưu trong `localStorage` (bọc try/catch).

### 8.8 Tab 3

6 mục:

1. Biểu diễn facelet/cubie
2. Nhóm Rubik và 3 bất biến
3. Sơ đồ vòng (circle puzzle)
4. LBL
5. Kociemba (G1, toạ độ, pruning, IDA*)
6. God's Number = 20

Mỗi mục có đoạn code 20–60 dòng chuyển qua lại Python / C++ / C# / Java / JS, tô màu cú pháp lúc build (Shiki, devDependency). Nút tải file đầy đủ tạo Blob tại chỗ.

### 8.9 Khả năng truy cập

- Mọi điều khiển tới được bằng bàn phím, có viền focus rõ.
- `aria-live` đọc nước đi và lỗi.
- Nút bật "Hiện ký hiệu" in chữ U/R/F/D/L/B lên chấm và ô (hỗ trợ người mù màu).
- Ô chọn màu có tên.
- Vùng chạm ≥ 32px.

### 8.10 Các trạng thái

- Loading: thanh tiến trình khi dựng bảng tra.
- Empty: Tab 2 có lưới trống kèm gợi ý "Lấy từ khối hiện tại".
- Error: lỗi inline dưới lưới.
- Đã giải: hiệu ứng nhỏ "Đã giải" (chỉ opacity/scale).

## 9. Kiểm thử và kiểm chứng

### 9.1 Vitest (TDD, PRNG có seed `mulberry32`)

- **cube**: mỗi nước lặp 4 lần = đồng nhất; nước + nghịch đảo = đồng nhất; `(R U R' U')×6` = đồng nhất; superflip ra đúng chuỗi facelet đã biết; parse/format đi rồi về khớp nhau.
- **cubie**: facelet ↔ cubie khớp trên 500 trạng thái ngẫu nhiên; mỗi loại lỗi ở mục 7 có ít nhất một lưới sai dựng tay.
- **rings**: mỗi vòng có 12 facelet khác nhau; mỗi facelet thuộc đúng 2 vòng; quay vòng khớp hoán vị của nước tương ứng; 54 chấm cách nhau ≥ ngưỡng tối thiểu.
- **solver**: Kociemba và LBL giải đúng 200 trạng thái seed; Kociemba ≤ 21 nước khi còn trong giới hạn nút; LBL thỏa bất biến từng giai đoạn.
- **scramble**: meet-in-the-middle khớp BFS vét cạn ở độ sâu ≤ 4; mỗi cấp sinh 50 đề, khoảng cách nằm đúng khoảng của cấp; đề dạng trạng thái luôn qua bộ kiểm tra hợp lệ.

### 9.2 `npm run verify:ref`

`reference/fixtures.json` gồm 30 trạng thái kèm lời giải Kociemba + LBL do bản TS sinh. Script chạy:

- Python 3.12 (stdlib)
- `g++ -std=c++17`
- `dotnet run` (.NET 9)
- `javac`/`java` (tương thích Java 11)
- `node` (không dependency)

Mỗi bản in JSON lời giải; script so từng nước với fixtures và áp thử lời giải. Bắt buộc pass khi sửa `src/solver/` hoặc `reference/`.

### 9.3 Kiểm thủ công giao diện

Trên Edge và Chrome, mở `dist/index.html` qua `file://`, kiểm:

- Đồng bộ 3D ↔ vòng theo cả hai chiều
- Ba tab
- Đổi VI/EN
- Đổi theme
- Ba breakpoint
- Chế độ reduced motion

### 9.4 Ngân sách hiệu năng

| Hạng mục | Ngưỡng |
|---|---|
| Dựng bảng tra lần đầu | < 2,5 giây |
| Mở lại khi có cache | < 300 ms |
| Kociemba | < 1 giây (thường gặp) |
| Animation | 60 fps |
| `dist/index.html` | ≤ 1,2 MB |

## 10. Xử lý lỗi

| Tình huống | Xử lý |
|---|---|
| Không có WebGL | Báo ngắn, ẩn khối 3D; sơ đồ 9 vòng vẫn chơi đầy đủ |
| Worker lỗi hoặc treo quá 10 giây | Hủy, tạo lại, hiện "Bộ giải gặp lỗi. Thử lại" + nút |
| IndexedDB/localStorage không dùng được | try/catch, dựng lại bảng tra mỗi lần mở, dùng cài đặt mặc định |
| Lưới sai | Hiện lỗi cụ thể, không gọi bộ giải |
| Input dồn dập | Hàng đợi tối đa 50 nước; thao tác tay tạm dừng việc phát lời giải |
| Kociemba hết giới hạn nút | Trả lời giải tốt nhất đã có (≤ 30) |

## 11. Tài liệu cho agent

- **CLAUDE.md** (tiếng Anh): mục đích, stack, lệnh (`dev`, `build`, `test`, `verify:ref`), bản đồ thư mục, luồng dữ liệu, thuật ngữ (facelet, cubie, circle puzzle, HTM, G1, pruning table, LBL stage), trỏ tới AGENTS.md / DESIGN.md / spec này.
- **AGENTS.md** (tiếng Anh), luật bắt buộc:
  1. `CubeState` là nguồn sự thật duy nhất; mọi nước qua `store.enqueue`; view không sửa state, không gọi nhau.
  2. Không bao giờ sinh đề không giải được (xáo từ trạng thái đã giải, hoặc trạng thái thỏa 3 bất biến + qua bộ kiểm tra hợp lệ).
  3. Nhãn cấp độ dựa trên khoảng cách đo được.
  4. TDD cho `core/`, `solver/`, `scramble/`; `npm test` xanh trước commit; không sửa test để cho qua.
  5. Sửa `solver/` hoặc `reference/` ⇒ `npm run verify:ref` phải pass; sinh lại fixtures phải có lý do ghi trong commit.
  6. Cấm `Math.random` và giới hạn theo thời gian trong `core/`, `solver/`, `scramble/`.
  7. Code/comment/commit tiếng Anh; mọi chữ hiển thị qua i18n, đủ `vi` + `en`.
  8. Lúc chạy chỉ dùng `three`; thêm dependency phải hỏi người dùng.
  9. Build = một HTML chạy từ `file://`, offline, không request mạng hay CDN.
  10. Ràng buộc code mẫu: Python 3.12 stdlib, C++17, .NET 9, Java 11, Node không dependency; cùng cấu trúc và thứ tự duyệt nước với bản TS.
  11. Màu/khoảng cách/bo góc chỉ từ token `theme.css`; tuân thủ DESIGN.md.
  12. Chỉ animate `transform`/`opacity`; tôn trọng reduced motion.
  13. Tuân thủ ngân sách hiệu năng (mục 9.4).
  14. Conventional Commits.
- **DESIGN.md** (tiếng Anh, 9 mục chuẩn Stitch):
  1. Không khí
  2. Bảng màu (cả hai theme)
  3. Chữ
  4. Component (CTA, nút phụ, keycap, pill-tab, row, panel, alert, ô lưới)
  5. Bố cục (lưới 2 cột, bội số 4px)
  6. Chiều sâu (thang nền + viền, không bóng)
  7. Nên / Không nên (một màu nhấn, không `#000`, không glow/gradient tím, không emoji, không lồng card, một CTA mỗi tab)
  8. Responsive
  9. Hướng dẫn prompt cho agent

  Nguồn tham khảo: taste-skill, impeccable.style, awesome-design-md (Raycast/Linear).

## 12. Ngoài phạm vi (YAGNI)

Lịch sử thời gian giải và bảng xếp hạng, âm thanh, PWA, E2E Playwright, lời giải tối ưu tuyệt đối (God's algorithm), khối khác 3×3, nhập màu bằng camera.

## 13. Rủi ro

- **Dựng bảng tra Kociemba bằng JS có thể vượt 2,5 giây trên máy yếu.** Giảm thiểu: cache IndexedDB, chạy trong worker, thanh tiến trình.
- **IndexedDB trên origin `file://` khác nhau giữa các trình duyệt.** Đã có đường dự phòng dựng lại bảng mỗi lần mở.
- **Các bản C++/C#/Java/Python lệch nhau ở chi tiết nhỏ (thứ tự duyệt nước, cách đánh chỉ số).** Giảm thiểu: `verify:ref` so sánh từng nước.
- **Đặt chấm trên sơ đồ vòng có thể sát nhau ở cụm trong.** Giảm thiểu: chỉnh `d` và các bán kính, có test khoảng cách tối thiểu.
