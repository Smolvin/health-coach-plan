// Постраничная навигация для списков веб-админки. У каждой сущности — свой
// размер страницы (см. PAGE_SIZES), подобранный под то, насколько длинным
// реально бывает список (например, оборудование зала — сеткой по 24, чтобы
// ровно ложилось на 4/6/8 в ряд; логи — 25, залов обычно немного и т.п.).
// Настройка — в коде, не через БД: делать для этого отдельный UI не просили,
// а плодить лишнюю сущность ради константы страницы не стали.
//
// Страницы с несколькими независимыми списками (например, карточка клиента —
// раунды/замеры/снимки одновременно) используют разные query-параметры для
// номера страницы каждого списка (param), а не общий ?page=, иначе
// перелистывание одного списка сбивало бы другой.
const PAGE_SIZES = {
  clients: 25,
  clientSurveys: 20,
  surveyAnswers: 20,
  measurements: 25,
  snapshots: 20,
  questions: 25,
  strategies: 25,
  strategyQuestions: 25,
  groups: 25,
  admins: 25,
  logs: 25,
  gyms: 25,
  gymEquipment: 24,
  classes: 25,
};

function pageSizeFor(entity) {
  return PAGE_SIZES[entity] || 25;
}

function getPage(req, param = 'page') {
  const page = parseInt(req.query[param], 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

// offset для SQL LIMIT/OFFSET по номеру страницы (1-based).
function getOffset(req, entity, param = 'page') {
  return (getPage(req, param) - 1) * pageSizeFor(entity);
}

// baseUrl — путь без query-параметра page (остальные query-параметры, если
// есть, добавляй в baseUrl сам, `?<param>=N` дописывается сюда через & или ?).
function pagerHtml(entity, baseUrl, page, total, param = 'page') {
  const pageSize = pageSizeFor(entity);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return '';

  const sep = baseUrl.includes('?') ? '&' : '?';
  const link = (p, label, disabled) =>
    disabled
      ? `<span class="pager-btn pager-disabled">${label}</span>`
      : `<a class="pager-btn" href="${baseUrl}${sep}${param}=${p}">${label}</a>`;

  return `<div class="pager">
    ${link(page - 1, '← Назад', page <= 1)}
    <span class="pager-info">стр. ${page} из ${totalPages} · всего ${total}</span>
    ${link(page + 1, 'Вперёд →', page >= totalPages)}
  </div>`;
}

module.exports = { PAGE_SIZES, pageSizeFor, getPage, getOffset, pagerHtml };
