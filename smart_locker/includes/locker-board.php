<?php
function renderLockerBoard(array $lockers, bool $admin = false): void
{
    echo '<div class="locker-grid" id="locker-grid" role="group" aria-label="Sơ đồ ngăn tủ, 3 cột">';
    foreach ($lockers as $locker) {
        $available = $locker['status'] === 'AVAILABLE' && $locker['online'];
        $issue = $locker['status'] === 'ERROR' || !$locker['online'] || ($locker['type'] === 'COOL' && $locker['status'] === 'OCCUPIED' && $locker['current_temp'] - $locker['target_temp'] > 5);
        $class = $admin ? 'admin-locker-tile ' . ($issue ? 'has-issue' : ($available ? 'available' : '')) : 'locker-card ' . ($available ? 'available' : ($locker['status'] === 'OCCUPIED' ? 'occupied' : 'unavailable'));
        $label = statusName($locker['status']);
        ?>
        <button type="button" class="locker-tile <?= $class ?>" data-id="<?= (int) $locker['id'] ?>" data-slot="<?= (int) $locker['slot'] ?>" data-type="<?= e($locker['type']) ?>"
                aria-label="<?= $admin ? 'Xem chi tiết ' : '' ?>Tủ <?= sprintf('%02d', $locker['slot']) ?>, <?= e($label) ?><?= $issue ? ', có cảnh báo' : '' ?>"
                <?php if ($admin): ?>data-open-dialog="locker-detail-<?= (int) $locker['id'] ?>"<?php elseif ($available): ?>aria-pressed="false" onclick="selectLocker(this)"<?php else: ?>disabled<?php endif; ?>>
            <span class="locker-number">TỦ <?= sprintf('%02d', $locker['slot']) ?></span>
            <span class="locker-type"><?= $locker['type'] === 'COOL' ? 'Ngăn mát' : 'Ngăn thường' ?></span>
            <strong class="locker-temperature"><?= e($locker['current_temp']) ?>°C</strong>
            <span class="locker-status"><?= e($label) ?><?= $admin && $issue ? ' ⚠' : '' ?></span>
        </button>
        <?php
    }
    if (!$lockers) echo '<p class="locker-grid-empty muted">Chưa có ngăn tủ nào.</p>';
    echo '</div><div class="locker-legend"><span><i class="legend-dot"></i>Đang trống</span><span><i class="legend-dot occupied"></i>Đang sử dụng</span><span><i class="legend-dot error"></i>Bảo trì / cảnh báo</span></div>';
}
