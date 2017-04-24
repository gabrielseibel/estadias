<!DOCTYPE html>
<html>
<input value="< Home" type="button" onclick="location.href='menu.php'">

<br><br>

<head>
</head>

<body>
<?php 
include "acessa.php";

if (isset($_GET['id'])) { 
$idApagar = $_GET['id'];
?>
O código <?php echo $idApagar; ?> foi apagado.
<?php
$sql="Delete from estadias where id = $idApagar";
if($conexao->query($sql) === false) {
	trigger_error('Erro na SQL: ' . $sql 	. ' Erro: ' . 
	$conexao->error, E_USER_ERROR);
} else {
	$affected_rows = $conexao->affected_rows; //linhas afetadas
	echo "Registros apagados $affected_rows.";
}
}
else {
echo "Você deve passar um parametro de id";
?>
<form method="get" action="">
ID a ser apagada: <input type="text" name="id">
<p><input type="submit" name="Enviar" value="Excluir"></p>
</form>
<?php
}
?>
<body bgcolor="#C0C0C0">

</body>

</html>
