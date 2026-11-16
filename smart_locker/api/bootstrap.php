<?php
require_once __DIR__ . '/../includes/app.php';

class ApiError extends RuntimeException
{
    public int $statusCode;
    public string $errorCode;
    public function __construct(string $message, int $statusCode = 422, string $errorCode = 'VALIDATION_ERROR')
    {
        parent::__construct($message);
        $this->statusCode = $statusCode;
        $this->errorCode = $errorCode;
    }
}
set_exception_handler(function (Throwable $error) {
    if ($error instanceof ApiError) apiResponse(['status' => 'error', 'code' => $error->errorCode, 'message' => $error->getMessage()], $error->statusCode);
    error_log((string) $error);
    apiResponse(['status' => 'error', 'code' => 'SERVER_ERROR', 'message' => 'Không thể xử lý yêu cầu lúc này. Vui lòng thử lại.'], 500);
});

/** Các hàm dùng chung cho endpoint API; chưa kết nối cơ sở dữ liệu / ESP32. */
function apiResponse(array $data, int $statusCode = 200): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function apiRequirePost(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        header('Allow: POST');
        apiResponse([
            'status' => 'error',
            'code' => 'METHOD_NOT_ALLOWED',
            'message' => 'Endpoint này chỉ chấp nhận phương thức POST.',
        ], 405);
    }
    if (!validCsrf()) apiResponse(['status' => 'error', 'code' => 'CSRF_ERROR', 'message' => 'Phiên làm việc đã thay đổi. Vui lòng tải lại trang.'], 419);
}

function apiUser(bool $admin = false): array
{
    $user = currentUser();
    if (!$user) throw new ApiError('Vui lòng đăng nhập để tiếp tục.', 401, 'UNAUTHENTICATED');
    if ($admin && $user['role'] !== 'ADMIN') throw new ApiError('Bạn không có quyền quản trị công ty.', 403, 'FORBIDDEN');
    return $user;
}
function apiText(string $name, int $maximum, bool $required = true): string
{
    $value = $_POST[$name] ?? '';
    if (!is_string($value) || ($required && trim($value) === '') || mb_strlen($value) > $maximum) throw new ApiError('Vui lòng kiểm tra trường ' . $name . '.');
    return trim($value);
}

function apiValidationError(string $message): void
{
    apiResponse([
        'status' => 'error',
        'code' => 'VALIDATION_ERROR',
        'message' => $message,
    ], 422);
}

function apiInput(string $name): string
{
    $value = $_POST[$name] ?? null;
    if (!is_string($value) || trim($value) === '') {
        apiValidationError('Thiếu hoặc sai định dạng trường ' . $name . '.');
    }

    return trim($value);
}

function apiLockerId(): int
{
    $lockerId = filter_var(apiInput('locker_id'), FILTER_VALIDATE_INT, [
        'options' => ['min_range' => 1],
    ]);
    if ($lockerId === false) {
        apiValidationError('Mã ngăn tủ phải là số nguyên dương.');
    }

    return $lockerId;
}

function apiNotImplemented(string $message): void
{
    apiResponse([
        'status' => 'error',
        'code' => 'NOT_IMPLEMENTED',
        'message' => $message,
    ], 501);
}
