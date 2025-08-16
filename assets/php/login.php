<?php
session_start();
require 'db.php'; // Database connection file

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = $_POST['username'] ?? '';
    $password = $_POST['password'] ?? '';

    if ($username && $password) {
        $stmt = $pdo->prepare('SELECT * FROM users WHERE username = ?');
        $stmt->execute([$username]);
        $user = $stmt->fetch();

        if ($user && password_verify($password, $user['password'])) {
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['username'] = $user['username'];
            header('Location: profile.php');
            exit();
        } else {
            $error = "Invalid username or password.";
        }
    } else {
        $error = "Please fill in all fields.";
    }
}
?>
<!-- Simple HTML Form -->
<html>
</head>
<body>
    <form class="login-container" method="post" action="login.php">
        <h2>Login</h2>
        <!-- Error message -->
        <?php if (isset($error)) echo '<div class="error">' . htmlspecialchars($error) . '</div>'; ?>
        <label for="username">Username</label>
        <input type="text" id="username" name="username" autocomplete="username" required>
        
        <label for="password">Password</label>
        <input type="password" id="password" name="password" autocomplete="current-password" required>
        
        <input type="submit" value="Login">
    </form>
</body>
</html>
