<?php
header("Content-Type: application/json");

$db_host = "IP_ВМ2";  // Или 127.0.0.1, если используете SSH-туннель
$db_user = "web_user";
$db_pass = "secure_password";
$db_name = "test_crosspost";

$conn = new mysqli($db_host, $db_user, $db_pass, $db_name);

if ($conn->connect_error) {
    die(json_encode(["error" => "Connection failed: " . $conn->connect_error]));
}

// GET: Получить все посты
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $result = $conn->query("SELECT * FROM posts");
    $posts = [];
    while ($row = $result->fetch_assoc()) {
        $posts[] = $row;
    }
    echo json_encode($posts);
}

// POST: Добавить пост
elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $text = $data['text'] ?? '';
    
    if (empty($text)) {
        http_response_code(400);
        echo json_encode(["error" => "Text is required"]);
        exit;
    }
    
    $stmt = $conn->prepare("INSERT INTO posts (text) VALUES (?)");
    $stmt->bind_param("s", $text);
    $stmt->execute();
    echo json_encode(["success" => true]);
}

$conn->close();
?>