// Может ли этот админ видеть/редактировать данные этого клиента — по группе.
function canSeeClient(admin, client) {
  if (!admin || !client) return false;
  if (admin.role === 'owner') return true;
  if (!admin.group_id) return true; // не ограничен группой — видит всех
  return client.group_id === admin.group_id;
}

module.exports = { canSeeClient };
