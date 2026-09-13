<?php

namespace RestockRadar\Storage;

use PDO;

/**
 * Single shared SQLite connection, schema applied on first connect.
 */
final class Database
{
    private static ?PDO $connection = null;

    public static function connection(): PDO
    {
        if (self::$connection !== null) {
            return self::$connection;
        }

        $path = getenv('RESTOCKRADAR_DB_PATH') ?: (__DIR__ . '/../../database/restockradar.sqlite');
        $isNew = !file_exists($path);

        $pdo = new PDO('sqlite:' . $path);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec('PRAGMA foreign_keys = ON');

        if ($isNew) {
            $schema = file_get_contents(__DIR__ . '/../../database/schema.sql');
            $pdo->exec($schema);
        }

        self::$connection = $pdo;

        return $pdo;
    }
}
