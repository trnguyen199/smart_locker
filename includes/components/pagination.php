<?php // Thành phần dùng chung; trang gọi cung cấp biến $pagination. ?>
<div class="locker-pagination d-flex flex-wrap justify-content-between align-items-center gap-3 mt-4">
    <div>
        <p class="text-muted small mb-2" aria-live="polite">
            Hiển thị <?= $pagination['first'] ?>–<?= $pagination['last'] ?> / <?= $pagination['total'] ?> ngăn tủ
        </p>
        <form method="get" class="d-flex flex-wrap align-items-center gap-2">
            <input type="hidden" name="page" value="1">
            <?php foreach (['q', 'status', 'mode'] as $queryKey): ?>
                <?php if (isset($pagination['query'][$queryKey]) && is_string($pagination['query'][$queryKey])): ?>
                    <input type="hidden" name="<?= $queryKey ?>" value="<?= htmlspecialchars($pagination['query'][$queryKey], ENT_QUOTES, 'UTF-8') ?>">
                <?php endif; ?>
            <?php endforeach; ?>
            <label for="per-page" class="small text-muted">Số tủ mỗi trang:</label>
            <select name="per_page" id="per-page" class="form-select form-select-sm pagination-page-size">
                <?php foreach ($pagination['page_sizes'] as $pageSize): ?>
                    <option value="<?= $pageSize ?>" <?= $pageSize === $pagination['per_page'] ? 'selected' : '' ?>><?= $pageSize ?></option>
                <?php endforeach; ?>
            </select>
            <button type="submit" class="btn btn-outline-primary btn-sm">Áp dụng</button>
        </form>
    </div>
    <nav aria-label="Phân trang danh sách ngăn tủ">
        <ul class="pagination pagination-sm flex-wrap mb-0">
            <li class="page-item <?= $pagination['page'] === 1 ? 'disabled' : '' ?>">
                <?php if ($pagination['page'] === 1): ?>
                    <span class="page-link" aria-disabled="true">Trước</span>
                <?php else: ?>
                    <a class="page-link" rel="prev" href="<?= htmlspecialchars(paginationUrl($pagination['page'] - 1, $pagination), ENT_QUOTES, 'UTF-8') ?>">Trước</a>
                <?php endif; ?>
            </li>
            <?php $previousPage = 0; ?>
            <?php foreach (paginationPageNumbers($pagination) as $pageNumber): ?>
                <?php if ($previousPage > 0 && $pageNumber - $previousPage > 1): ?>
                    <li class="page-item disabled"><span class="page-link" aria-hidden="true">…</span></li>
                <?php endif; ?>
                <li class="page-item <?= $pageNumber === $pagination['page'] ? 'active' : '' ?>">
                    <?php if ($pageNumber === $pagination['page']): ?>
                        <span class="page-link" aria-current="page"><?= $pageNumber ?></span>
                    <?php else: ?>
                        <a class="page-link" aria-label="Trang <?= $pageNumber ?>" href="<?= htmlspecialchars(paginationUrl($pageNumber, $pagination), ENT_QUOTES, 'UTF-8') ?>"><?= $pageNumber ?></a>
                    <?php endif; ?>
                </li>
                <?php $previousPage = $pageNumber; ?>
            <?php endforeach; ?>
            <li class="page-item <?= $pagination['page'] === $pagination['total_pages'] ? 'disabled' : '' ?>">
                <?php if ($pagination['page'] === $pagination['total_pages']): ?>
                    <span class="page-link" aria-disabled="true">Sau</span>
                <?php else: ?>
                    <a class="page-link" rel="next" href="<?= htmlspecialchars(paginationUrl($pagination['page'] + 1, $pagination), ENT_QUOTES, 'UTF-8') ?>">Sau</a>
                <?php endif; ?>
            </li>
        </ul>
    </nav>
</div>
