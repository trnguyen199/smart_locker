<?php

function db(): PDO
{
    static $connection;
    if ($connection instanceof PDO) return $connection;

    $path = getenv('SMART_LOCKER_DB') ?: dirname(__DIR__, 2) . '/.smart-locker-data/app.sqlite';
    $directory = dirname($path);
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Không thể tạo thư mục dữ liệu.');
    }
    $connection = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $connection->exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    $connection->exec(file_get_contents(__DIR__ . '/../database/schema.sql'));
    return $connection;
}

function queryAll(string $sql, array $values = []): array
{
    $query = db()->prepare($sql);
    $query->execute($values);
    return $query->fetchAll();
}

function queryOne(string $sql, array $values = []): ?array
{
    $query = db()->prepare($sql);
    $query->execute($values);
    $row = $query->fetch();
    return $row === false ? null : $row;
}

function executeSql(string $sql, array $values = []): int
{
    $query = db()->prepare($sql);
    $query->execute($values);
    return $query->rowCount();
}

function seedCompanyLockers(int $companyId): void
{
    for ($slot = 1; $slot <= 9; $slot++) {
        $cool = $slot % 2 === 1;
        executeSql('INSERT INTO lockers (company_id, slot, type, current_temp, target_temp) VALUES (?, ?, ?, ?, ?)',
            [$companyId, $slot, $cool ? 'COOL' : 'NORMAL', $cool ? 8 : 25, $cool ? 8 : 25]);
    }
}

function atomic(callable $work)
{
    $connection = db();
    $connection->exec('BEGIN IMMEDIATE');
    try {
        $result = $work();
        $connection->exec('COMMIT');
        return $result;
    } catch (Throwable $error) {
        $connection->exec('ROLLBACK');
        throw $error;
    }
}
