<?php
declare(strict_types=1);

// Router bảo vệ cho PHP built-in server. Apache/Nginx phải có cấu hình tương đương.
$uriPath = rawurldecode((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));
$uriPath = '/' . ltrim(str_replace('\\', '/', $uriPath), '/');
$segments = array_values(array_filter(explode('/', $uriPath), static fn(string $part): bool => $part !== ''));
$extension = strtolower(pathinfo($uriPath, PATHINFO_EXTENSION));

$hasHiddenSegment = count(array_filter(
    $segments,
    static fn(string $part): bool => str_starts_with($part, '.')
)) > 0;
$isPrivatePath = $hasHiddenSegment
    || str_starts_with($uriPath, '/tests/')
    || str_starts_with($uriPath, '/supabase/')
    || (str_starts_with($uriPath, '/config/') && $uriPath !== '/config/supabase.js')
    || in_array($extension, ['env', 'example', 'ini', 'log', 'md', 'mjs', 'sql'], true);

if ($isPrivatePath) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo 'Not Found';
    return true;
}

$target = __DIR__ . str_replace('/', DIRECTORY_SEPARATOR, $uriPath);
if ($uriPath !== '/' && is_file($target)) {
    return false;
}

if ($uriPath === '/') {
    require __DIR__ . '/index.php';
    return true;
}

return false;
