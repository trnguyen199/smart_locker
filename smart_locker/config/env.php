<?php
// [VẤN ĐÁP]: File tải biến môi trường từ .env giúp tách biệt Secret Key khỏi mã nguồn PHP.
declare(strict_types=1);

function slLoadEnv(?string $preferredPath = null): array
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }

    $candidates = array_filter([
        $preferredPath,
        __DIR__ . '/../.env',
        __DIR__ . '/../../../.env',
        getcwd() . '/.env',
        getcwd() . '/smart_locker-main/smart_locker/.env',
    ]);

    $envPath = null;
    foreach ($candidates as $candidate) {
        if (is_file($candidate) && is_readable($candidate)) {
            $envPath = $candidate;
            break;
        }
    }

    $cache = [];
    if (!$envPath) {
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

    // Tự động đồng bộ giữa chuẩn mới SUPABASE_SECRET_KEY và tên cũ SUPABASE_SERVICE_ROLE_KEY
    if (!empty($cache['SUPABASE_SECRET_KEY']) && empty($cache['SUPABASE_SERVICE_ROLE_KEY'])) {
        $cache['SUPABASE_SERVICE_ROLE_KEY'] = $cache['SUPABASE_SECRET_KEY'];
    } elseif (!empty($cache['SUPABASE_SERVICE_ROLE_KEY']) && empty($cache['SUPABASE_SECRET_KEY'])) {
        $cache['SUPABASE_SECRET_KEY'] = $cache['SUPABASE_SERVICE_ROLE_KEY'];
    }

    if (!empty($cache['SUPABASE_PUBLISHABLE_KEY']) && empty($cache['SUPABASE_ANON_KEY'])) {
        $cache['SUPABASE_ANON_KEY'] = $cache['SUPABASE_PUBLISHABLE_KEY'];
    } elseif (!empty($cache['SUPABASE_ANON_KEY']) && empty($cache['SUPABASE_PUBLISHABLE_KEY'])) {
        $cache['SUPABASE_PUBLISHABLE_KEY'] = $cache['SUPABASE_ANON_KEY'];
    }

    return $cache;
}

function slEnv(string $key, string $default = ''): string
{
    $env = slLoadEnv();
    if (isset($env[$key]) && $env[$key] !== '') {
        return $env[$key];
    }
    // Hỗ trợ alias chéo SUPABASE_SECRET_KEY <-> SUPABASE_SERVICE_ROLE_KEY
    if ($key === 'SUPABASE_SERVICE_ROLE_KEY' && isset($env['SUPABASE_SECRET_KEY']) && $env['SUPABASE_SECRET_KEY'] !== '') {
        return $env['SUPABASE_SECRET_KEY'];
    }
    if ($key === 'SUPABASE_SECRET_KEY' && isset($env['SUPABASE_SERVICE_ROLE_KEY']) && $env['SUPABASE_SERVICE_ROLE_KEY'] !== '') {
        return $env['SUPABASE_SERVICE_ROLE_KEY'];
    }
    $sys = getenv($key);
    if ($sys !== false && $sys !== '') {
        return (string) $sys;
    }
    return $default;
}
