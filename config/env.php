<?php
// [VẤN ĐÁP]: Tải biến môi trường từ `.env` giúp tách hoàn toàn Secret Key khỏi mã nguồn PHP.
declare(strict_types=1);

function slLoadEnv(string $envPath): array
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }

    $cache = [];
    if (!is_file($envPath) || !is_readable($envPath)) {
        return $cache;
    }

    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!is_array($lines)) {
        return $cache;
    }

    foreach ($lines as $line) {
        $trimmed = trim($line);
        if ($trimmed === '' || strpos($trimmed, '#') === 0) {
            continue;
        }
        $pos = strpos($trimmed, '=');
        if ($pos === false) {
            continue;
        }
        $key = trim(substr($trimmed, 0, $pos));
        $val = trim(substr($trimmed, $pos + 1));
        $val = trim($val, "\"'");
        $cache[$key] = $val;
    }

    return $cache;
}

function slEnv(string $key, string $default = ''): string
{
    $env = slLoadEnv(__DIR__ . '/../.env');
    if (isset($env[$key]) && $env[$key] !== '') {
        return $env[$key];
    }
    $sys = getenv($key);
    if ($sys !== false && $sys !== '') {
        return (string) $sys;
    }
    return $default;
}
