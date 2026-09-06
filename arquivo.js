const SUPABASE_URL = "https://vkguqpgpbmkczphepjwe.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_oRc6xmlEbcZZRdPyl26_WQ_wG3jxQmO";

const ONLINE =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("COLE_AQUI") &&
  !SUPABASE_ANON_KEY.includes("COLE_AQUI");

const initial = {
  livros: [],
  alunos: [],
  emprestimos: [],
};

let db = JSON.parse(
  localStorage.getItem("bibliotecaDB") || JSON.stringify(initial),
);
let sb = ONLINE
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
let currentUser = null;
let editingBookId = null;
const today = new Date().toISOString().slice(0, 10);

document.getElementById("today").textContent = new Date().toLocaleDateString(
  "pt-BR",
);
document.getElementById("loanDate").value = today;
document.getElementById("loanDue").value = today;

function setConnection(ok, text) {
  const el = document.getElementById("connection");
  el.textContent = (ok ? "● Online" : "● Offline") + (text ? " — " + text : "");
}

function saveLocal() {
  localStorage.setItem("bibliotecaDB", JSON.stringify(db));
}

async function save() {
  saveLocal();
  render();
  if (ONLINE && currentUser) {
    try {
      await syncLocalToCloud();
      setConnection(true, "sincronizado");
    } catch (e) {
      console.error(e);
      setConnection(false, "alterações locais pendentes");
      alert(
        'A alteração foi salva neste computador, mas não foi sincronizada com o banco online. Verifique a conexão e tente "Sincronizar".',
      );
    }
  }
}

async function login() {
  const email = document.getElementById("user").value.trim();
  const password = document.getElementById("pass").value;

  if (!email || !password) {
    alert("Informe o e-mail e a senha.");
    return;
  }

  if (!ONLINE || !sb) {
    alert("O sistema não está conectado ao Supabase.");
    return;
  }

  const { data, error } = await sb.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) {
    alert("Não foi possível entrar: " + error.message);
    console.error("Erro de login:", error);
    return;
  }

  currentUser = data.user;

  document.getElementById("login").style.display = "none";

  await loadCloud();
}

async function logout() {
  if (ONLINE && sb) await sb.auth.signOut();
  currentUser = null;
  document.getElementById("login").style.display = "flex";
}

function tab(id) {
  document
    .querySelectorAll(".tab")
    .forEach((x) => x.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  render();
}

function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[m],
  );
}

function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

async function addBook() {
  let b = {
    id: uid(),
    titulo: bookTitle.value.trim(),
    autor: bookAuthor.value.trim(),
    codigo: bookCode.value.trim(),
    ativo: true,
  };
  if (!b.titulo) {
    alert("Informe o título.");
    return;
  }
  db.livros.push(b);
  [bookTitle, bookAuthor, bookCode].forEach((x) => (x.value = ""));
  await save();
}

function editBook(id) {
  const book = db.livros.find((item) => item.id === id);
  if (!book) return;
  editingBookId = id;
  editBookName.value = book.titulo || "";
  editBookAuthor.value = book.autor || "";
  editBookCode.value = book.codigo || "";
  editBookStatus.value = String(book.ativo !== false);
  editBookModal.classList.remove("hidden");
  editBookName.focus();
}

function closeEditBook() {
  editingBookId = null;
  editBookModal.classList.add("hidden");
}

async function saveEditBook() {
  const book = db.livros.find((item) => item.id === editingBookId);
  if (!book) return;
  const titulo = editBookName.value.trim();
  if (!titulo) {
    alert("Informe o título.");
    return;
  }
  book.titulo = titulo;
  book.autor = editBookAuthor.value.trim();
  book.codigo = editBookCode.value.trim();
  book.ativo = editBookStatus.value === "true";
  closeEditBook();
  await save();
}

async function addStudent() {
  let a = {
    id: uid(),
    nome: stuName.value.trim(),
    turma: stuClass.value.trim(),
    matricula: stuReg.value.trim(),
    email: stuEmail.value.trim(),
  };
  if (!a.nome) {
    alert("Informe o nome.");
    return;
  }
  db.alunos.push(a);
  [stuName, stuClass, stuReg, stuEmail].forEach((x) => (x.value = ""));
  await save();
}

async function addLoan() {
  if (!loanStudent.value || !loanBook.value)
    return alert("Selecione aluno e livro.");
  if (db.emprestimos.some((l) => !l.devolvido && l.livro === loanBook.value))
    return alert("Este livro já está emprestado.");
  db.emprestimos.push({
    id: uid(),
    aluno: loanStudent.value,
    livro: loanBook.value,
    data: loanDate.value,
    prazo: loanDue.value,
    devolvido: false,
    dataDevolucao: "",
  });
  await save();
}

async function returnLoan(id) {
  let l = db.emprestimos.find((x) => x.id === id);
  if (!l) return;
  l.devolvido = true;
  l.dataDevolucao = today;
  await save();
}

function getStudent(id) {
  return db.alunos.find((x) => x.id === id)?.nome || "—";
}
function getBook(id) {
  return db.livros.find((x) => x.id === id)?.titulo || "—";
}
function late(l) {
  return !l.devolvido && l.prazo < today;
}

async function loadCloud() {
  if (!ONLINE || !currentUser) return;
  setConnection(true, "carregando");
  try {
    const [books, students, loans] = await Promise.all([
      sb.from("livros").select("*").order("titulo"),
      sb.from("alunos").select("*").order("nome"),
      sb.from("emprestimos").select("*").order("data", { ascending: false }),
    ]);
    if (books.error) throw books.error;
    if (students.error) throw students.error;
    if (loans.error) throw loans.error;

    db = {
      livros: books.data.map((b) => ({
        id: b.id,
        titulo: b.titulo,
        autor: b.autor,
        codigo: b.codigo,
        ativo: b.ativo,
      })),
      alunos: students.data.map((a) => ({
        id: a.id,
        nome: a.nome,
        turma: a.turma,
        matricula: a.matricula,
        email: a.email,
      })),
      emprestimos: loans.data.map((l) => ({
        id: l.id,
        aluno: l.aluno,
        livro: l.livro,
        data: l.data,
        prazo: l.prazo,
        devolvido: l.devolvido,
        dataDevolucao: l.data_devolucao || "",
      })),
    };
    saveLocal();
    setConnection(true, "sincronizado");
    render();
  } catch (e) {
    console.error(e);
    setConnection(false, "erro de conexão");
    alert(
      "Não foi possível carregar o banco online. O sistema continuará em modo local.",
    );
  }
}

async function syncLocalToCloud() {
  if (!ONLINE || !currentUser) return;

  // Upsert all records. The SQL below enables RLS policies for authenticated users.
  const b = db.livros.map((x) => ({
    id: x.id,
    titulo: x.titulo,
    autor: x.autor,
    codigo: x.codigo,
    ativo: x.ativo,
  }));
  const a = db.alunos.map((x) => ({
    id: x.id,
    nome: x.nome,
    turma: x.turma,
    matricula: x.matricula,
    email: x.email,
  }));
  const l = db.emprestimos.map((x) => ({
    id: x.id,
    aluno: x.aluno,
    livro: x.livro,
    data: x.data,
    prazo: x.prazo,
    devolvido: x.devolvido,
    data_devolucao: x.dataDevolucao || null,
  }));

  for (const [table, rows] of [
    ["livros", b],
    ["alunos", a],
    ["emprestimos", l],
  ]) {
    if (rows.length) {
      const { error } = await sb.from(table).upsert(rows);
      if (error) throw error;
    }
  }
}

async function syncNow() {
  if (!ONLINE) {
    alert(
      "Configure SUPABASE_URL e SUPABASE_ANON_KEY no código para ativar o banco online.",
    );
    return;
  }
  if (!currentUser) {
    alert("Entre no sistema primeiro.");
    return;
  }
  await syncLocalToCloud();
  await loadCloud();
  alert("Banco online sincronizado com sucesso.");
}

function render() {
  let activeBooks = db.livros.filter((x) => x.ativo !== false);
  let activeLoans = db.emprestimos.filter((x) => !x.devolvido);
  let lateLoans = activeLoans.filter(late);

  cBooks.textContent = activeBooks.length;
  cStudents.textContent = db.alunos.length;
  cLoans.textContent = activeLoans.length;
  cLate.textContent = lateLoans.length;

  alerts.innerHTML = lateLoans.length
    ? lateLoans
        .map(
          (l) => `<p class="late">⚠️ ${esc(getStudent(l.aluno))}:
   <b>${esc(getBook(l.livro))}</b> — prazo
   ${new Date(l.prazo + "T00:00:00").toLocaleDateString("pt-BR")}</p>`,
        )
        .join("")
    : "<p>Nenhum empréstimo em atraso.</p>";

  bookRows.innerHTML = db.livros
    .map(
      (b) => `<tr>
   <td>${esc(b.titulo)}</td><td>${esc(b.autor)}</td><td>${esc(b.codigo)}</td>
   <td><span class="status-badge ${b.ativo === false ? "status-inactive" : "status-active"}">${b.ativo === false ? "Inativo" : "Ativo"}</span></td>
   <td><button type="button" onclick="editBook('${b.id}')">Editar</button></td></tr>`,
    )
    .join("");

  studentRows.innerHTML = db.alunos
    .map(
      (a) => `<tr>
   <td>${esc(a.nome)}</td><td>${esc(a.turma)}</td><td>${esc(a.matricula)}</td>
   <td>${esc(a.email)}</td></tr>`,
    )
    .join("");

  loanStudent.innerHTML =
    '<option value="">Selecione o aluno</option>' +
    db.alunos
      .map(
        (a) =>
          `<option value="${a.id}">${esc(a.nome)} — ${esc(a.turma)}</option>`,
      )
      .join("");

  loanBook.innerHTML =
    '<option value="">Selecione o livro</option>' +
    db.livros
      .filter(
        (b) => b.ativo !== false && !activeLoans.some((l) => l.livro === b.id),
      )
      .map((b) => `<option value="${b.id}">${esc(b.titulo)}</option>`)
      .join("");

  loanRows.innerHTML = db.emprestimos
    .slice()
    .reverse()
    .map(
      (l) => `<tr>
   <td>${esc(getStudent(l.aluno))}</td><td>${esc(getBook(l.livro))}</td>
   <td>${esc(l.data)}</td><td>${esc(l.prazo)}</td>
   <td><span class="${late(l) ? "late" : "badge"}">${
     l.devolvido ? "Devolvido" : late(l) ? "Em atraso" : "Ativo"
   }</span></td>
   <td>${
     l.devolvido
       ? ""
       : `<button onclick="returnLoan('${l.id}')">
     Registrar devolução</button>`
   }</td></tr>`,
    )
    .join("");

  reportArea.innerHTML =
    "<b>Resumo:</b> " +
    db.livros.length +
    " livros cadastrados, " +
    db.alunos.length +
    " alunos e " +
    db.emprestimos.length +
    " empréstimos registrados.";
}

function exportJSON() {
  let a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(db, null, 2)], { type: "application/json" }),
  );
  a.download = "backup-biblioteca-" + today + ".json";
  a.click();
}

function importJSON(e) {
  let f = e.target.files[0];
  if (!f) return;
  let r = new FileReader();
  r.onload = async () => {
    try {
      db = JSON.parse(r.result);
      saveLocal();
      render();
      if (ONLINE && currentUser) await syncLocalToCloud();
      alert("Backup restaurado e sincronizado.");
    } catch (err) {
      alert("Arquivo JSON inválido.");
    }
  };
  r.readAsText(f);
}

function exportCSV() {
  let rows = [
    [
      "Aluno",
      "Turma",
      "Livro",
      "Data",
      "Prazo",
      "Devolvido",
      "Data de devolução",
    ],
  ];
  db.emprestimos.forEach((l) => {
    let a = db.alunos.find((x) => x.id === l.aluno) || {},
      b = db.livros.find((x) => x.id === l.livro) || {};
    rows.push([
      a.nome,
      a.turma,
      b.titulo,
      l.data,
      l.prazo,
      l.devolvido ? "Sim" : "Não",
      l.dataDevolucao || "",
    ]);
  });
  let csv = rows
    .map((r) =>
      r.map((v) => '"' + String(v ?? "").replaceAll('"', '""') + '"').join(";"),
    )
    .join("\n");
  let a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
  );
  a.download = "relatorio-emprestimos-" + today + ".csv";
  a.click();
}

function printReport() {
  document.getElementById("reportArea").innerHTML =
    "<h3>Relatório de empréstimos</h3>" +
    document.getElementById("loanRows").parentElement.outerHTML;
  window.print();
}

// Mantém a tela atualizada caso outra máquina altere dados.
if (ONLINE) {
  sb.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
  });
}

render();
