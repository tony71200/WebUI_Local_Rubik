import type { AlgoSection } from './algo.ts';

// Vietnamese text for the "Thuật toán" tab (trusted, static HTML).
export const SECTIONS_VI: AlgoSection[] = [
  {
    id: 'model',
    title: '1. Biểu diễn khối: facelet và cubie',
    html: `<p>Khối có 54 ô màu (<em>facelet</em>), đánh số 0–53 theo thứ tự mặt U R F D L B, mỗi mặt đọc từng hàng. Trạng thái của khối chỉ là một mảng 54 số.</p>
<p>Mỗi phép xoay là một <strong>hoán vị</strong> của 54 vị trí. Thay vì gõ tay bảng hoán vị, ta gắn cho mỗi ô toạ độ khối con <code>p</code> và pháp tuyến <code>n</code>, quay 90° những ô nằm trên lớp cần xoay, rồi tra lại chỉ số: hoán vị tự sinh ra nên không thể gõ nhầm.</p>
<p>Cách nhìn thứ hai là <em>cubie</em>: 8 góc và 12 cạnh, mỗi khối có vị trí và hướng (góc xoay 0–2, cạnh lật 0–1). Bộ giải Kociemba làm việc trên cubie.</p>`,
  },
  {
    id: 'invariants',
    title: '2. Nhóm Rubik và 3 bất biến',
    html: `<p>Mọi trạng thái xoay được từ khối đã giải tạo thành <strong>nhóm Rubik</strong> với 43.252.003.274.489.856.000 phần tử (khoảng 4,3 × 10<sup>19</sup>).</p>
<p>Nếu tháo ra lắp lại tuỳ ý thì có gấp 12 lần số đó, và chỉ 1/12 giải được. Ba định luật phân biệt chúng:</p>
<ul><li>tổng hướng các góc chia hết cho 3 (một góc bị vặn: không giải được);</li>
<li>tổng lật các cạnh là số chẵn (một cạnh bị lật: không giải được);</li>
<li>tính chẵn lẻ của hoán vị góc bằng của hoán vị cạnh (hai khối bị tráo: không giải được).</li></ul>
<p>1/3 × 1/2 × 1/2 = 1/12. Tab "Giải" dùng chính 3 định luật này để báo lỗi, còn Tab "Ra đề" dùng chúng để chỉ sinh trạng thái giải được.</p>`,
  },
  {
    id: 'rings',
    title: '3. Sơ đồ 9 vòng (circle puzzle)',
    html: `<p>9 lát cắt (3 trục × 3 lớp) được vẽ thành 9 vòng tròn: mỗi họ vòng đồng tâm ứng với một trục, mỗi vòng đi qua đúng 12 ô của lát cắt đó.</p>
<p>Mỗi ô nằm trên đúng 2 lát cắt, nên mỗi chấm là <strong>giao điểm của 2 vòng khác họ</strong>. Hai vòng cắt nhau tại 2 điểm: một cho mặt có pháp tuyến dương (U, R, F), một cho mặt đối diện (D, L, B, nằm gần tâm hơn). 3 cặp họ × 9 cặp vòng × 2 điểm = 54 chấm.</p>
<p>Đây là một <strong>biểu diễn đẳng cấu</strong> (isomorphic representation): cùng một nhóm hoán vị trên 54 phần tử, chỉ khác cách vẽ. Quay một lớp tức là trượt 12 chấm 3 nấc dọc vòng của nó, đồng thời 8 chấm của mặt bị xoay quay quanh chấm tâm.</p>`,
  },
  {
    id: 'lbl',
    title: '4. Phương pháp từng tầng (LBL)',
    html: `<p>7 giai đoạn: chữ thập trắng → góc tầng 1 → cạnh tầng 2 → chữ thập vàng → xếp cạnh vàng → đặt vị trí góc vàng → xoay góc vàng. Trước tiên cả khối được xoay để mặt trắng xuống dưới.</p>
<p>Mỗi giai đoạn chỉ dùng vài công thức cố định (<code>R U R' U'</code>, <code>F R U R' U' F'</code>, <code>R U R' U R U2 R'</code>…). Công thức được viết cho mặt trước rồi <em>đổi nhãn</em> (relabel) sang mặt khác, thay vì xoay cả khối.</p>
<p>Bước đưa khối vào vị trí chuẩn bị dùng một tìm kiếm rất nông (≤ 4 nước), nên không phải liệt kê từng trường hợp. Trung bình khoảng 160 nước: dài nhưng dễ hiểu từng bước.</p>`,
  },
  {
    id: 'kociemba',
    title: '5. Thuật toán 2 pha của Kociemba',
    html: `<p><strong>Pha 1</strong> đưa khối vào nhóm con G1 = ⟨U, D, R2, L2, F2, B2⟩: không góc nào bị vặn, không cạnh nào bị lật, 4 cạnh tầng giữa nằm trong tầng giữa. Pha 1 mô tả khối bằng 3 toạ độ: twist (2187 giá trị), flip (2048), slice (495).</p>
<p><strong>Pha 2</strong> giải trong G1 chỉ với 10 phép xoay trên, bằng 3 toạ độ khác: hoán vị góc (40320), hoán vị 8 cạnh (40320), hoán vị lát giữa (24).</p>
<p>Mỗi pha là <strong>IDA*</strong>: tìm sâu dần và cắt nhánh khi <em>bảng cắt tỉa</em> (pruning table, lập bằng BFS) cho biết không thể tới đích kịp. Bộ giải tiếp tục rút ngắn trong một ngân sách nút cố định, nên kết quả tất định: cùng đầu vào cho cùng lời giải ở cả 5 ngôn ngữ.</p>`,
  },
  {
    id: 'gods',
    title: '6. Con số của Chúa = 20',
    html: `<p>Năm 2010, Rokicki, Kociemba, Davidson và Dethridge chứng minh mọi trạng thái đều giải được trong tối đa <strong>20 nước</strong> (tính U2 là một nước), dùng khoảng 35 năm CPU do Google tài trợ.</p>
<p><em>Superflip</em> (mọi cạnh đều bị lật, mọi thứ khác đúng chỗ) là trạng thái nổi tiếng cần đúng 20 nước.</p>
<p>Ứng dụng này đo khoảng cách chính xác tới 9 nước bằng <strong>meet-in-the-middle</strong>: dựng sẵn 621.649 trạng thái cách đích ≤ 5 nước, rồi tìm ≤ 4 nước từ đề cho tới khi chạm tập đó.</p>`,
  },
];
