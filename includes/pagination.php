<?php

/** Phân trang dữ liệu mẫu; chỉ chấp nhận số nguyên dương từ URL. */
function paginationPositiveInteger($value, int $default): int
{
    if (!is_string($value) && !is_int($value)) {
        return $default;
    }

    $number = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);

    return $number === false ? $default : $number;
}

function paginateItems(array $items, array $query): array
{
    $pageSizes = [9, 18, 27];
    $perPage = paginationPositiveInteger($query['per_page'] ?? 9, 9);
    if (!in_array($perPage, $pageSizes, true)) {
        $perPage = 9;
    }

    $total = count($items);
    $totalPages = max(1, (int) ceil($total / $perPage));
    $page = min(paginationPositiveInteger($query['page'] ?? 1, 1), $totalPages);
    $offset = ($page - 1) * $perPage;

    return [
        'items' => array_slice($items, $offset, $perPage),
        'page' => $page,
        'per_page' => $perPage,
        'page_sizes' => $pageSizes,
        'total' => $total,
        'total_pages' => $totalPages,
        'first' => $total === 0 ? 0 : $offset + 1,
        'last' => min($offset + $perPage, $total),
        'query' => $query,
    ];
}

/** Giữ các tham số hiện có khi chuyển trang. */
function paginationUrl(int $page, array $pagination): string
{
    $query = array_merge($pagination['query'], [
        'page' => $page,
        'per_page' => $pagination['per_page'],
    ]);

    return '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
}

/** Hiển thị trang đầu, trang cuối và các trang gần trang hiện tại. */
function paginationPageNumbers(array $pagination): array
{
    $numbers = array_unique(array_merge(
        [1, $pagination['total_pages']],
        range(max(1, $pagination['page'] - 1), min($pagination['total_pages'], $pagination['page'] + 1))
    ));
    sort($numbers);

    return $numbers;
}
