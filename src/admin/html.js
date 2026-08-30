// Минимальные HTML-хелперы для веб-админки: без шаблонизатора и фронтенд-сборки,
// достаточно для внутреннего инструмента на несколько страниц.

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const NAV = [
  ['/', 'Дашборд'],
  ['/clients', 'Клиенты'],
  ['/questions', 'Вопросы'],
  ['/strategies', 'Стратегии'],
  ['/groups', 'Группы'],
  ['/admins', 'Админы'],
  ['/logs', 'Логи'],
  ['/gyms', 'Залы'],
  ['/classes', 'Классы'],
  ['/menu', 'Меню'],
];

function layout({ title, active, body, extraHead = '', bodyEnd = '' }) {
  const nav = NAV.map(
    ([href, label]) => `<a href="${href}"${href === active ? ' class="active"' : ''}>${label}</a>`
  ).join('\n');

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Health Coach Admin</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: light-dark(#f6f5f2, #14181a);
    color: light-dark(#1c211d, #e9ede9);
  }
  header {
    display: flex; align-items: center; gap: 24px;
    padding: 14px 24px; border-bottom: 1px solid light-dark(#e0ddd3, #262c27);
    background: light-dark(#ffffff, #191f1b);
  }
  header h1 { font-size: 16px; margin: 0; white-space: nowrap; }
  nav { display: flex; gap: 4px; flex-wrap: wrap; }
  nav a {
    padding: 6px 12px; border-radius: 8px; text-decoration: none;
    color: light-dark(#3a453d, #b7c2ba); font-size: 14px;
  }
  nav a.active, nav a:hover { background: light-dark(#e7f2ec, #22302a); color: light-dark(#146c4c, #3fd8a3); }
  main { padding: 24px; max-width: 980px; margin: 0 auto; }
  h2 { font-size: 20px; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid light-dark(#e6e3da, #232a25); vertical-align: top; }
  th { color: light-dark(#6b756e, #8fa196); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  tr:hover td { background: light-dark(#fafaf7, #1b211d); }
  a { color: light-dark(#146c4c, #3fd8a3); }
  .card {
    background: light-dark(#ffffff, #191f1b); border: 1px solid light-dark(#e6e3da, #262c27);
    border-radius: 12px; padding: 18px 20px; margin-bottom: 20px;
  }
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; }
  .stat { text-align: left; }
  .stat .n { font-size: 28px; font-weight: 700; display: block; }
  .stat .label { font-size: 12px; color: light-dark(#6b756e, #8fa196); text-transform: uppercase; letter-spacing: .04em; }
  form.inline { display: inline-flex; align-items: center; gap: 6px; }
  form.inline select { width: auto; padding: 4px 8px; font-size: 13px; }
  form.inline button { padding: 4px 10px; font-size: 13px; }
  label { display: block; font-size: 13px; margin: 12px 0 4px; color: light-dark(#3a453d, #b7c2ba); }
  input[type=text], input[type=number], select, textarea {
    width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid light-dark(#d8d4c8, #2c332d);
    background: light-dark(#fff, #10140f); color: inherit; font-size: 14px; font-family: inherit;
  }
  textarea { min-height: 90px; }
  button, input[type=submit] {
    background: light-dark(#1f8f6b, #3fd8a3); color: light-dark(#fff, #0d1a15); border: none;
    border-radius: 8px; padding: 8px 14px; font-size: 14px; font-weight: 600; cursor: pointer;
  }
  button.secondary { background: transparent; color: light-dark(#146c4c, #3fd8a3); border: 1px solid light-dark(#c9e4d8, #2c332d); }
  button.danger { background: light-dark(#c9432f, #e5674f); }
  .pill { display: inline-block; padding: 2px 9px; border-radius: 99px; font-size: 12px; background: light-dark(#eef2ee, #20271f); }
  .muted { color: light-dark(#6b756e, #8fa196); }
  .actions { display: flex; gap: 8px; align-items: center; }
  .badge-owner { color: #b8860b; }
  .table-wrap { overflow-x: auto; }
  .col-wrap { max-width: 420px; word-break: break-word; }
  button.icon-danger {
    background: transparent; color: light-dark(#c9432f, #e5674f);
    border: 1px solid light-dark(#e8c9c2, #4a2f2a); border-radius: 8px;
    width: 30px; height: 30px; padding: 0; font-size: 15px; line-height: 1; cursor: pointer;
  }
  button.icon-danger:hover { background: light-dark(#fbecea, #2a1a17); }
  button.icon-danger:disabled { opacity: .5; cursor: default; }
  .save-status { font-size: 12px; color: light-dark(#146c4c, #3fd8a3); margin-left: 6px; }
  .pager { display: flex; align-items: center; gap: 12px; margin-top: 14px; font-size: 13px; }
  .pager-btn {
    padding: 5px 12px; border-radius: 7px; text-decoration: none;
    border: 1px solid light-dark(#d8d4c8, #2c332d); color: light-dark(#146c4c, #3fd8a3);
  }
  .pager-btn:hover { background: light-dark(#e7f2ec, #22302a); }
  .pager-disabled { opacity: .4; }
  .pager-info { color: light-dark(#6b756e, #8fa196); }
</style>
${extraHead}
</head>
<body>
<header>
  <h1>Health Coach — Админка</h1>
  <nav>${nav}</nav>
</header>
<main>
${body}
</main>
${bodyEnd}
</body>
</html>`;
}

// Общий AJAX-обработчик форм для страниц, где не хочется дёргать полную
// перезагрузку на каждое сохранение/удаление (сейчас — /menu, /strategies/:code).
// Ничего не меняет на бэкенде: те же POST-роуты с редиректом, просто отправляются
// через fetch, а не обычной отправкой формы. На форме — data-атрибуты:
//   data-ajax                — обязательный маркер, что форму нужно перехватывать
//   data-confirm="..."       — подтверждение перед отправкой (вместо inline onsubmit)
//   data-refresh="id1 id2"   — после успеха подменить эти контейнеры свежей
//                              версией (фоновый fetch этой же страницы + DOMParser)
//   data-remove-row="tr"     — после успеха сразу убрать ближайший подходящий
//                              предок (для строк удаления — без ожидания refresh)
//   data-success-text="..."  — текст статуса вместо дефолтного "Сохранено ✓"
// Без data-refresh и data-remove-row — просто показывает статус рядом с кнопкой.
const AJAX_FORMS_SCRIPT = `<script>
(function () {
  async function refreshContainers(ids) {
    const html = await fetch(location.href, { cache: 'no-store' }).then(function (r) { return r.text(); });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    ids.forEach(function (id) {
      var fresh = doc.getElementById(id);
      var mine = document.getElementById(id);
      if (fresh && mine) {
        mine.replaceWith(fresh);
        bindForms(fresh);
      }
    });
  }

  function bindForms(root) {
    root.querySelectorAll('form[data-ajax]').forEach(function (form) {
      if (form.dataset.bound) return;
      form.dataset.bound = '1';
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (form.dataset.confirm && !confirm(form.dataset.confirm)) return;

        var btn = form.querySelector('button[type=submit]');
        var originalText = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = '…'; }

        fetch(form.action, { method: 'POST', body: new URLSearchParams(new FormData(form)) })
          .then(function (res) {
            if (!res.ok) throw new Error('bad status');
            if (form.dataset.removeRow) {
              var row = form.closest(form.dataset.removeRow);
              if (row) row.remove();
              return;
            }
            if (form.dataset.refresh) {
              return refreshContainers(form.dataset.refresh.split(' ').filter(Boolean));
            }
            if (btn) {
              btn.textContent = originalText;
              var status = document.createElement('span');
              status.className = 'save-status';
              status.textContent = form.dataset.successText || 'Сохранено ✓';
              btn.insertAdjacentElement('afterend', status);
              setTimeout(function () { status.remove(); }, 1500);
            }
          })
          .catch(function () {
            alert('Не удалось сохранить. Попробуй ещё раз.');
          })
          .finally(function () {
            if (btn && document.body.contains(btn) && btn.textContent === '…') {
              btn.disabled = false;
              btn.textContent = originalText;
            } else if (btn) {
              btn.disabled = false;
            }
          });
      });
    });
  }

  bindForms(document);
})();
</script>`;

module.exports = { escapeHtml, layout, AJAX_FORMS_SCRIPT };
