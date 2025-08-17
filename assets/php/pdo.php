<?php
// PHP Data Objects(PDO) Sample Code:
try {
    $conn = new PDO("sqlsrv:server = tcp:redws.database.windows.net,1433; Database = redws", "wstudio", "{Wswslogic777}");
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
}
catch (PDOException $e) {
    print("Error connecting to SQL Server.");
    die(print_r($e));
}

// SQL Server Extension Sample Code:
$connectionInfo = array("UID" => "wstudio", "pwd" => "{Wswslogic777}", "Database" => "redws", "LoginTimeout" => 30, "Encrypt" => 1, "TrustServerCertificate" => 0);
$serverName = "tcp:redws.database.windows.net,1433";
$conn = sqlsrv_connect($serverName, $connectionInfo);

?>
