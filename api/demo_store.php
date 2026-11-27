<?php
/**
 * FILE: api/demo_store.php
 * Chức năng: Lưu trữ cục bộ (JSON file trong storage/demo_db.json) tương thích PostgREST subset,
 * chỉ kích hoạt khi APP_ENV=development, LOCAL_DEMO_FALLBACK=true và chưa điền SUPABASE_SECRET_KEY.
 * Giúp toàn bộ Web + API + Mô phỏng 3D + Mạch Wokwi chạy demo đầy đủ ngay lập tức.
 */
declare(strict_types=1);

function demoDbPath(): string
{
    $dir = __DIR__ . '/../storage';
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    return $dir . '/demo_db.json';
}

function demoSeedDatabase(): array
{
    $now = gmdate('c');
    $lockers = [
        ['id' => 1, 'slot' => 1, 'code' => 'TỦ 01', 'type' => 'THERMAL', 'status' => 'AVAILABLE', 'current_temp' => 25.0, 'target_temp' => 25.0, 'humidity' => 55.0, 'pwm_power' => 0, 'door_locked' => true, 'has_item' => false, 'online' => true, 'active_category' => null, 'active_shipper_otp' => null, 'active_receiver_otp' => null, 'wrong_attempts' => 0, 'lockout_until' => null, 'pending_cmd' => null, 'last_ping_at' => $now, 'updated_at' => $now],
        ['id' => 2, 'slot' => 2, 'code' => 'TỦ 02', 'type' => 'THERMAL', 'status' => 'AVAILABLE', 'current_temp' => 25.0, 'target_temp' => 25.0, 'humidity' => 55.0, 'pwm_power' => 0, 'door_locked' => true, 'has_item' => false, 'online' => true, 'active_category' => null, 'active_shipper_otp' => null, 'active_receiver_otp' => null, 'wrong_attempts' => 0, 'lockout_until' => null, 'pending_cmd' => null, 'last_ping_at' => $now, 'updated_at' => $now],
        ['id' => 3, 'slot' => 3, 'code' => 'TỦ 03', 'type' => 'THERMAL', 'status' => 'OCCUPIED', 'current_temp' => 25.0, 'target_temp' => 25.0, 'humidity' => 55.0, 'pwm_power' => 0, 'door_locked' => true, 'has_item' => true, 'online' => true, 'active_category' => 'PARCEL', 'active_shipper_otp' => '184920', 'active_receiver_otp' => '654321', 'wrong_attempts' => 0, 'lockout_until' => null, 'pending_cmd' => null, 'last_ping_at' => $now, 'updated_at' => $now],
        ['id' => 4, 'slot' => 4, 'code' => 'TỦ 04', 'type' => 'THERMAL', 'status' => 'AVAILABLE', 'current_temp' => 25.0, 'target_temp' => 25.0, 'humidity' => 55.0, 'pwm_power' => 0, 'door_locked' => true, 'has_item' => false, 'online' => true, 'active_category' => null, 'active_shipper_otp' => null, 'active_receiver_otp' => null, 'wrong_attempts' => 0, 'lockout_until' => null, 'pending_cmd' => null, 'last_ping_at' => $now, 'updated_at' => $now],
        ['id' => 5, 'slot' => 5, 'code' => 'TỦ 05', 'type' => 'THERMAL', 'status' => 'AVAILABLE', 'current_temp' => 25.0, 'target_temp' => 25.0, 'humidity' => 55.0, 'pwm_power' => 0, 'door_locked' => true, 'has_item' => false, 'online' => true, 'active_category' => null, 'active_shipper_otp' => null, 'active_receiver_otp' => null, 'wrong_attempts' => 0, 'lockout_until' => null, 'pending_cmd' => null, 'last_ping_at' => $now, 'updated_at' => $now],
        ['id' => 6, 'slot' => 6, 'code' => 'TỦ 06', 'type' => 'THERMAL', 'status' => 'OCCUPIED', 'current_temp' => 25.0, 'target_temp' => 25.0, 'humidity' => 55.0, 'pwm_power' => 0, 'door_locked' => true, 'has_item' => true, 'online' => true, 'active_category' => 'PARCEL', 'active_shipper_otp' => '312345', 'active_receiver_otp' => '246810', 'wrong_attempts' => 0, 'lockout_until' => null, 'pending_cmd' => null, 'last_ping_at' => $now, 'updated_at' => $now],
        ['id' => 7, 'slot' => 7, 'code' => 'TỦ 07', 'type' => 'THERMAL', 'status' => 'AVAILABLE', 'current_temp' => 25.0, 'target_temp' => 25.0, 'humidity' => 55.0, 'pwm_power' => 0, 'door_locked' => true, 'has_item' => false, 'online' => true, 'active_category' => null, 'active_shipper_otp' => null, 'active_receiver_otp' => null, 'wrong_attempts' => 0, 'lockout_until' => null, 'pending_cmd' => null, 'last_ping_at' => $now, 'updated_at' => $now],
        ['id' => 8, 'slot' => 8, 'code' => 'TỦ 08', 'type' => 'THERMAL', 'status' => 'AVAILABLE', 'current_temp' => 25.0, 'target_temp' => 25.0, 'humidity' => 55.0, 'pwm_power' => 0, 'door_locked' => true, 'has_item' => false, 'online' => true, 'active_category' => null, 'active_shipper_otp' => null, 'active_receiver_otp' => null, 'wrong_attempts' => 0, 'lockout_until' => null, 'pending_cmd' => null, 'last_ping_at' => $now, 'updated_at' => $now],
        ['id' => 9, 'slot' => 9, 'code' => 'TỦ 09', 'type' => 'THERMAL', 'status' => 'AVAILABLE', 'current_temp' => 25.0, 'target_temp' => 25.0, 'humidity' => 55.0, 'pwm_power' => 0, 'door_locked' => true, 'has_item' => false, 'online' => true, 'active_category' => null, 'active_shipper_otp' => null, 'active_receiver_otp' => null, 'wrong_attempts' => 0, 'lockout_until' => null, 'pending_cmd' => null, 'last_ping_at' => $now, 'updated_at' => $now],
    ];

    $bookings = [
        [
            'id' => 1,
            'locker_id' => 3,
            'slot' => 3,
            'category' => 'PARCEL',
            'target_temp' => 25.0,
            'sender_id' => 'demo-admin-uuid',
            'sender_email' => 'admin@smartlocker.demo',
            'sender_name' => 'Quản trị Demo',
            'recipient_email' => 'nhanvien@smartlocker.demo',
            'shipper_otp' => '184920',
            'receiver_otp' => '654321',
            'shipper_otp_used_at' => gmdate('c', time() - 1800),
            'receiver_otp_used_at' => null,
            'expires_at' => gmdate('c', time() + 86400),
            'status' => 'ACTIVE',
            'created_at' => gmdate('c', time() - 3600),
            'collected_at' => null,
        ],
        [
            'id' => 2,
            'locker_id' => 6,
            'slot' => 6,
            'category' => 'PARCEL',
            'target_temp' => 25.0,
            'sender_id' => 'demo-admin-uuid',
            'sender_email' => 'admin@smartlocker.demo',
            'sender_name' => 'Quản trị Demo',
            'recipient_email' => 'khachhang@smartlocker.demo',
            'shipper_otp' => '312345',
            'receiver_otp' => '246810',
            'shipper_otp_used_at' => gmdate('c', time() - 900),
            'receiver_otp_used_at' => null,
            'expires_at' => gmdate('c', time() + 86400),
            'status' => 'ACTIVE',
            'created_at' => gmdate('c', time() - 1800),
            'collected_at' => null,
        ],
    ];

    return [
        'sequences' => [
            'bookings' => 3,
            'telemetry_logs' => 1,
            'alerts' => 1,
            'audit_logs' => 1,
            'company_members' => 2,
            'support_tickets' => 1,
        ],
        'profiles' => [],
        'lockers' => $lockers,
        'bookings' => $bookings,
        'telemetry_logs' => [],
        'alerts' => [],
        'audit_logs' => [],
        'company_members' => [
            [
                'id' => 1,
                'company_name' => 'Smart Locker Demo Co.',
                'member_email' => 'admin@smartlocker.demo',
                'role' => 'ADMIN',
                'status' => 'ACTIVE',
                'invited_by' => 'system@smartlocker.local',
                'created_at' => $now,
            ],
        ],
        'support_tickets' => [],
    ];
}

function demoSplitTopLevel(string $expr): array
{
    $parts = [];
    $buf = '';
    $depth = 0;
    $len = strlen($expr);
    for ($i = 0; $i < $len; $i++) {
        $ch = $expr[$i];
        if ($ch === '(') {
            $depth++;
        } elseif ($ch === ')' && $depth > 0) {
            $depth--;
        } elseif ($ch === ',' && $depth === 0) {
            $parts[] = trim($buf);
            $buf = '';
            continue;
        }
        $buf .= $ch;
    }
    if (trim($buf) !== '') {
        $parts[] = trim($buf);
    }
    return $parts;
}

function demoMatchScalarFilter(array $row, string $field, string $expr): bool
{
    $val = $row[$field] ?? null;
    if (strpos($expr, 'eq.') === 0) {
        $target = substr($expr, 3);
        if ($target === 'true') return (bool) $val === true;
        if ($target === 'false') return (bool) $val === false;
        return (string) $val === $target;
    }
    if (strpos($expr, 'ilike.') === 0) {
        $pattern = str_replace('*', '%', substr($expr, 6));
        $regex = '/^' . str_replace('%', '.*', preg_quote($pattern, '/')) . '$/i';
        return preg_match($regex, (string) $val) === 1;
    }
    if (strpos($expr, 'is.') === 0) {
        $target = substr($expr, 3);
        if ($target === 'null') return $val === null;
        if ($target === 'true') return $val === true;
        if ($target === 'false') return $val === false;
        return false;
    }
    if (strpos($expr, 'lt.') === 0 || strpos($expr, 'gte.') === 0) {
        $isGte = strpos($expr, 'gte.') === 0;
        $raw = substr($expr, $isGte ? 4 : 3);
        $tsRow = is_string($val) ? strtotime($val) : false;
        $tsTarget = strtotime($raw);
        if ($tsRow !== false && $tsTarget !== false) {
            return $isGte ? ($tsRow >= $tsTarget) : ($tsRow < $tsTarget);
        }
        return $isGte ? ((float) $val >= (float) $raw) : ((float) $val < (float) $raw);
    }
    return true;
}

function demoRowMatchesParams(array $row, array $params): bool
{
    foreach ($params as $key => $value) {
        if (in_array($key, ['select', 'order', 'limit', 'on_conflict'], true)) {
            continue;
        }
        if ($key === 'or' && preg_match('/^\((.*)\)$/', (string) $value, $m)) {
            $clauses = demoSplitTopLevel($m[1]);
            $any = false;
            foreach ($clauses as $clause) {
                $dot = strpos($clause, '.');
                if ($dot === false) continue;
                $f = substr($clause, 0, $dot);
                $op = substr($clause, $dot + 1);
                if (demoMatchScalarFilter($row, $f, $op)) {
                    $any = true;
                    break;
                }
            }
            if (!$any) return false;
            continue;
        }
        if (!demoMatchScalarFilter($row, (string) $key, (string) $value)) {
            return false;
        }
    }
    return true;
}

function demoSupabaseRequest(string $method, string $endpoint, ?array $body = null, array $extraHeaders = []): array
{
    $method = strtoupper($method);
    $path = parse_url($endpoint, PHP_URL_PATH) ?: $endpoint;
    $queryStr = parse_url($endpoint, PHP_URL_QUERY) ?: '';
    $params = [];
    if ($queryStr !== '') {
        foreach (explode('&', $queryStr) as $pair) {
            if ($pair === '') continue;
            $eq = strpos($pair, '=');
            if ($eq === false) continue;
            $k = rawurldecode(substr($pair, 0, $eq));
            $v = rawurldecode(substr($pair, $eq + 1));
            $params[$k] = $v;
        }
    }

    if (!preg_match('#^/rest/v1/([a-z_]+)$#', $path, $m)) {
        return ['status' => 404, 'ok' => false, 'data' => ['message' => 'Unknown demo table: ' . $path]];
    }
    $table = $m[1];

    $dbPath = demoDbPath();
    $fp = fopen($dbPath, 'c+');
    if (!$fp) {
        return ['status' => 500, 'ok' => false, 'data' => ['message' => 'Không mở được storage/demo_db.json']];
    }
    flock($fp, LOCK_EX);
    $raw = stream_get_contents($fp);
    $db = ($raw !== false && trim($raw) !== '') ? json_decode($raw, true) : null;
    if (!is_array($db) || empty($db['lockers'])) {
        $db = demoSeedDatabase();
    }
    if (!isset($db[$table]) || !is_array($db[$table])) {
        $db[$table] = [];
    }

    $rows = &$db[$table];
    $dirty = false;
    $resultData = [];
    $status = 200;

    if ($method === 'GET') {
        $matched = array_values(array_filter($rows, static fn($r) => demoRowMatchesParams($r, $params)));
        if (!empty($params['order'])) {
            $orderParts = explode('.', (string) $params['order']);
            $orderField = $orderParts[0];
            $desc = strtolower($orderParts[1] ?? 'asc') === 'desc';
            usort($matched, static function ($a, $b) use ($orderField, $desc) {
                $av = $a[$orderField] ?? null;
                $bv = $b[$orderField] ?? null;
                $cmp = $av <=> $bv;
                return $desc ? -$cmp : $cmp;
            });
        }
        if (!empty($params['limit'])) {
            $matched = array_slice($matched, 0, max(1, (int) $params['limit']));
        }
        $resultData = $matched;
    } elseif ($method === 'POST') {
        $payload = $body ?? [];
        $now = gmdate('c');
        if (!isset($payload['created_at'])) {
            $payload['created_at'] = $now;
        }
        if ($table === 'telemetry_logs' && !isset($payload['recorded_at'])) {
            $payload['recorded_at'] = $now;
        }
        if ($table === 'profiles' && !empty($params['on_conflict']) && $params['on_conflict'] === 'id' && isset($payload['id'])) {
            $updatedIdx = null;
            foreach ($rows as $idx => $existing) {
                if (($existing['id'] ?? '') === $payload['id']) {
                    $updatedIdx = $idx;
                    break;
                }
            }
            if ($updatedIdx !== null) {
                $rows[$updatedIdx] = array_merge($rows[$updatedIdx], $payload);
                $inserted = $rows[$updatedIdx];
            } else {
                $rows[] = $payload;
                $inserted = $payload;
            }
        } else {
            if (!isset($payload['id'])) {
                $seq = (int) ($db['sequences'][$table] ?? (count($rows) + 1));
                $payload['id'] = $seq;
                $db['sequences'][$table] = $seq + 1;
            }
            if ($table === 'company_members') {
                foreach ($rows as $existing) {
                    if (strcasecmp((string) ($existing['company_name'] ?? ''), (string) ($payload['company_name'] ?? '')) === 0
                        && strcasecmp((string) ($existing['member_email'] ?? ''), (string) ($payload['member_email'] ?? '')) === 0) {
                        flock($fp, LOCK_UN);
                        fclose($fp);
                        return ['status' => 409, 'ok' => false, 'data' => ['message' => 'Duplicate member email']];
                    }
                }
            }
            $rows[] = $payload;
            $inserted = $payload;
        }
        $dirty = true;
        $status = 201;
        $resultData = [$inserted];
    } elseif ($method === 'PATCH') {
        $payload = $body ?? [];
        $updated = [];
        foreach ($rows as $idx => $row) {
            if (demoRowMatchesParams($row, $params)) {
                $rows[$idx] = array_merge($row, $payload);
                $updated[] = $rows[$idx];
                $dirty = true;
            }
        }
        $resultData = $updated;
    } elseif ($method === 'DELETE') {
        $deleted = [];
        $kept = [];
        foreach ($rows as $row) {
            if (demoRowMatchesParams($row, $params)) {
                $deleted[] = $row;
                $dirty = true;
            } else {
                $kept[] = $row;
            }
        }
        $db[$table] = $kept;
        $resultData = $deleted;
    }

    if ($dirty || !is_file($dbPath) || trim((string) $raw) === '') {
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($db, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        fflush($fp);
    }

    flock($fp, LOCK_UN);
    fclose($fp);

    return ['status' => $status, 'ok' => true, 'data' => $resultData];
}
