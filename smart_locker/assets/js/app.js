// Chỉ các tương tác giao diện: menu, dialog, tìm FAQ. Không gọi API nghiệp vụ.
window.showToast = (message, error = false) => {
    const region = document.getElementById('toast-region');
    if (!region) return;
    const toast = document.createElement('div');
    toast.className = 'toast' + (error ? ' error' : '');
    toast.textContent = message;
    region.append(toast);
    setTimeout(() => toast.remove(), 6000);
};
document.addEventListener('click', event => {
    const opener = event.target.closest('[data-open-dialog]');
    if (opener) document.getElementById(opener.dataset.openDialog)?.showModal();
    const closer = event.target.closest('[data-close-dialog]');
    if (closer) closer.closest('dialog')?.close();
});
const sidebarButton = document.querySelector('[data-toggle-sidebar]');
const sidebar = document.getElementById('app-sidebar');
const mobileQuery = window.matchMedia('(max-width: 1000px)');
function setSidebar(open) {
    document.body.classList.toggle('sidebar-open', open);
    sidebarButton?.setAttribute('aria-expanded', String(open));
    if (sidebar) sidebar.inert = mobileQuery.matches && !open;
}
sidebarButton?.addEventListener('click', () => setSidebar(!document.body.classList.contains('sidebar-open')));
document.querySelector('[data-close-sidebar]')?.addEventListener('click', () => setSidebar(false));
mobileQuery.addEventListener('change', () => setSidebar(false));
setSidebar(false);
document.addEventListener('keydown', event => { if (event.key === 'Escape') setSidebar(false); });
const siteMenu = document.querySelector('[data-toggle-site-menu]');
siteMenu?.addEventListener('click', () => {
    const open = document.body.classList.toggle('site-menu-open');
    siteMenu.setAttribute('aria-expanded', String(open));
});
document.querySelectorAll('[data-preview-form]').forEach(form => form.addEventListener('submit', event => {
    event.preventDefault();
    showToast('Đây là bản xem trước giao diện. Chức năng này chưa được kết nối.');
}));
let faqCategory = 'ALL';
const normalizeText = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
function filterFaqs() {
    const query = normalizeText(document.getElementById('faq-search')?.value.trim() || '');
    let visible = 0;
    document.querySelectorAll('.faq-item').forEach(item => {
        const match = (faqCategory === 'ALL' || item.dataset.category === faqCategory) && normalizeText(item.textContent).includes(query);
        item.hidden = !match;
        if (match) visible++;
    });
    const empty = document.getElementById('faq-empty');
    if (empty) empty.hidden = visible > 0;
}
document.getElementById('faq-search')?.addEventListener('input', filterFaqs);
document.querySelectorAll('[data-faq-category]').forEach(button => button.addEventListener('click', () => {
    faqCategory = button.dataset.faqCategory;
    document.querySelectorAll('[data-faq-category]').forEach(chip => {
        chip.classList.toggle('active', chip === button);
        chip.setAttribute('aria-pressed', String(chip === button));
    });
    filterFaqs();
}));