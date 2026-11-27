<?php
/**
 * FILE: api/hardware.php
 * Chức năng: Đọc thông tin mạch phần cứng thực tế từ thư mục hardware/ (node_1..node_3/diagram.json),
 * kiểm tra trạng thái firmware (.ino), và ghép nối với trạng thái thời gian thực của 9 ngăn tủ
 * để Web và Mô phỏng 3D hiển thị sơ đồ mạch & tín hiệu GPIO đồng bộ.
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
requireMethod('GET');

$hardwareDir = realpath(__DIR__ . '/../hardware');
$nodes = [];
$firmwareFiles = [];

if ($hardwareDir && is_dir($hardwareDir)) {
    // Kiểm tra xem trong hardware/ đã có file firmware (.ino / .cpp / platformio.ini) hay chưa
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($hardwareDir, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $file) {
        $ext = strtolower($file->getExtension());
        if (in_array($ext, ['ino', 'cpp', 'c'], true) || strtolower($file->getFilename()) === 'platformio.ini') {
            $firmwareFiles[] = str_replace($hardwareDir . DIRECTORY_SEPARATOR, '', $file->getPathname());
        }
    }
}

// Bảng ánh xạ GPIO chuẩn khớp với hardware/README.md và hardware/node_1..3/diagram.json
$nodeDefinitions = [
    1 => [
        'node' => 1,
        'title' => 'ESP32 Node 1 (Ngăn 01 – 03)',
        'diagram_path' => 'hardware/node_1/diagram.json',
        'slots' => [
            1 => ['type' => 'COOL', 'servo_gpio' => 13, 'door_switch_gpio' => 32, 'ds18b20_gpio' => 16, 'relay_gpio' => 26],
            2 => ['type' => 'NORMAL', 'servo_gpio' => 14, 'door_switch_gpio' => 33, 'ds18b20_gpio' => 17, 'relay_gpio' => null],
            3 => ['type' => 'COOL', 'servo_gpio' => 27, 'door_switch_gpio' => 25, 'ds18b20_gpio' => 18, 'relay_gpio' => 19],
        ],
    ],
    2 => [
        'node' => 2,
        'title' => 'ESP32 Node 2 (Ngăn 04 – 06)',
        'diagram_path' => 'hardware/node_2/diagram.json',
        'slots' => [
            4 => ['type' => 'NORMAL', 'servo_gpio' => 13, 'door_switch_gpio' => 32, 'ds18b20_gpio' => 16, 'relay_gpio' => null],
            5 => ['type' => 'COOL', 'servo_gpio' => 14, 'door_switch_gpio' => 33, 'ds18b20_gpio' => 17, 'relay_gpio' => 23],
            6 => ['type' => 'NORMAL', 'servo_gpio' => 27, 'door_switch_gpio' => 25, 'ds18b20_gpio' => 18, 'relay_gpio' => null],
        ],
    ],
    3 => [
        'node' => 3,
        'title' => 'ESP32 Node 3 (Ngăn 07 – 09)',
        'diagram_path' => 'hardware/node_3/diagram.json',
        'slots' => [
            7 => ['type' => 'COOL', 'servo_gpio' => 13, 'door_switch_gpio' => 32, 'ds18b20_gpio' => 16, 'relay_gpio' => 26],
            8 => ['type' => 'NORMAL', 'servo_gpio' => 14, 'door_switch_gpio' => 33, 'ds18b20_gpio' => 17, 'relay_gpio' => null],
            9 => ['type' => 'COOL', 'servo_gpio' => 27, 'door_switch_gpio' => 25, 'ds18b20_gpio' => 18, 'relay_gpio' => 19],
        ],
    ],
];

// Lấy trạng thái tủ hiện tại từ DB (Supabase hoặc Demo DB)
$lockerMap = [];
$lRes = supabaseRequest('GET', '/rest/v1/lockers?select=*&order=slot.asc');
if ($lRes['ok'] && is_array($lRes['data'])) {
    foreach ($lRes['data'] as $l) {
        $lockerMap[(int) ($l['slot'] ?? $l['id'])] = $l;
    }
}

foreach ($nodeDefinitions as $nodeId => $def) {
    $diagFile = __DIR__ . '/../' . $def['diagram_path'];
    $diagramExists = is_file($diagFile);
    $partsCount = 0;
    $connectionsCount = 0;
    $partTypes = [];
    $diagramData = ['parts' => [], 'connections' => []];

    if ($diagramExists) {
        $decoded = json_decode((string) file_get_contents($diagFile), true);
        if (is_array($decoded)) {
            $parts = is_array($decoded['parts'] ?? null) ? $decoded['parts'] : [];
            $connections = is_array($decoded['connections'] ?? null) ? $decoded['connections'] : [];
            $diagramData = [
                'parts' => $parts,
                'connections' => $connections,
            ];
            $partsCount = count($parts);
            $connectionsCount = count($connections);
            foreach ($parts as $p) {
                $t = (string) ($p['type'] ?? '');
                if ($t !== '' && $t !== 'wokwi-text') {
                    $partTypes[$t] = ($partTypes[$t] ?? 0) + 1;
                }
            }
        }
    }

    $slotStates = [];
    foreach ($def['slots'] as $slotId => $pins) {
        $l = $lockerMap[$slotId] ?? null;
        $doorLocked = $l ? (bool) ($l['door_locked'] ?? true) : true;
        $curTemp = $l ? (float) ($l['current_temp'] ?? 25.0) : 25.0;
        $tgtTemp = $l ? (float) ($l['target_temp'] ?? 25.0) : 25.0;
        $humidity = $l ? (float) ($l['humidity'] ?? 55.0) : 55.0;
        $pwm = $l ? (int) ($l['pwm_power'] ?? 0) : 0;
        $slotOnline = $l ? (bool) ($l['online'] ?? true) : false;
        $hasItem = $l ? (bool) ($l['has_item'] ?? false) : false;
        $lastPingAt = $l['last_ping_at'] ?? null;
        $mode = $tgtTemp < 20.0 ? 'COOL' : ($tgtTemp >= 30.0 ? 'HEAT' : 'OFF');
        $coolingActive = $pins['relay_gpio'] !== null && ($pwm > 0 || ($curTemp > $tgtTemp + 0.5 && $tgtTemp < 20.0));

        $slotStates[] = [
            'slot' => $slotId,
            'code' => sprintf('TỦ %02d', $slotId),
            'type' => 'THERMAL',
            'gpio' => $pins,
            'signals' => [
                'online' => $slotOnline,
                'has_item' => $hasItem,
                'last_ping_at' => $lastPingAt,
                'mode' => $mode,
                'humidity' => $humidity,
                'servo_angle' => $doorLocked ? 0 : 90,
                'door_switch' => $doorLocked ? 'LOW (Đóng)' : 'HIGH (Mở)',
                'ds18b20_temp' => $curTemp,
                'target_temp' => $tgtTemp,
                'relay_active' => $coolingActive,
                'pwm_power' => $pwm,
                'status' => $l['status'] ?? 'AVAILABLE',
            ],
        ];
    }

    $nodes[] = [
        'node' => $nodeId,
        'title' => $def['title'],
        'diagram_path' => $def['diagram_path'],
        'diagram_exists' => $diagramExists,
        'parts_count' => $partsCount,
        'connections_count' => $connectionsCount,
        'part_summary' => $partTypes,
        'diagram' => $diagramData,
        'slots' => $slotStates,
    ];
}

jsonResponse([
    'ok' => true,
    'circuit_summary' => [
        'diagrams_present' => count(array_filter($nodes, fn($n) => $n['diagram_exists'])) === 3,
        'diagram_count' => count(array_filter($nodes, fn($n) => $n['diagram_exists'])),
        'firmware_present' => count($firmwareFiles) > 0,
        'firmware_files' => $firmwareFiles,
        'note' => count($firmwareFiles) > 0
            ? 'Đã có cả sơ đồ Wokwi và firmware ESP32.'
            : 'Đã có 3 sơ đồ mạch Wokwi (node_1, node_2, node_3 cho 9 ngăn) trong hardware/; chưa có file firmware (.ino) cho ESP32 nên phần mạch hiện đang đồng bộ trạng thái GPIO từ Mô phỏng 3D & Backend.',
    ],
    'nodes' => $nodes,
    'server_time' => gmdate('c'),
]);
