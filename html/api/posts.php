<?php
header("Content-Type: application/json");

$db_host = "192.168.52.102"; 
$db_host = "127.0.0.1";    

$db_port = 3306;            
$db_user = "web_user";       
$db_pass = "Password1!";     
$db_name = "test_crosspost"; 
// Устанавливаем соединение
try {
    $conn = new mysqli($db_host, $db_user, $db_pass, $db_name, $db_port);
    
    if ($conn->connect_error) {
        throw new Exception("MySQL connection failed: " . $conn->connect_error);
    }

    // Обработка GET-запроса (получение постов)
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $result = $conn->query("SELECT id, text, created_at FROM posts ORDER BY created_at DESC");
        if (!$result) {
            throw new Exception("Query failed: " . $conn->error);
        }
        
        $posts = [];
        while ($row = $result->fetch_assoc()) {
            $posts[] = $row;
        }
        echo json_encode($posts);
    }

    // Обработка POST-запроса (добавление поста)
    elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true);
        $text = trim($data['text'] ?? '');
        
        if (empty($text)) {
            http_response_code(400);
            echo json_encode(["error" => "Text cannot be empty"]);
            exit;
        }
        
        $stmt = $conn->prepare("INSERT INTO posts (text) VALUES (?)");
        if (!$stmt) {
            throw new Exception("Prepare failed: " . $conn->error);
        }
        
        $stmt->bind_param("s", $text);
        if (!$stmt->execute()) {
            throw new Exception("Execute failed: " . $stmt->error);
        }
        
        echo json_encode([
            "success" => true,
            "id" => $stmt->insert_id,
            "message" => "Post added successfully"
        ]);
    }

    // Для недопустимых методов
    else {
        http_response_code(405);
        echo json_encode(["error" => "Method not allowed"]);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "error" => "Database error",
        "details" => $e->getMessage(),
        "connection" => [
            "host" => $db_host,
            "port" => $db_port,
            "user" => $db_user
        ]
    ]);
} finally {
    if (isset($conn)) {
        $conn->close();
    }
}
?>