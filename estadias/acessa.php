<?php 
$servidor = 'localhost'; // e.x 'localhost' or '192.168.1.100'
$user   = 'root';
$senha   = '';
$nomeBanco   = 'estadias';


$conexao = new mysqli($servidor, $user, $senha, $nomeBanco);
 
// verifica conex�o
if ($conexao->connect_error) {
	trigger_error('Falha na conex�o: '.
	$conexxao->connect_error, E_USER_ERROR);
}
//acessa.php

//localhost/nomedapastadevoces/acessa.php

/*
$conexao= mysqli_connect($Servidor, $User, $Senha, $NomeBanco);

// verifica conex�o
if (mysqli_connect_errno()) {
  trigger_error('Falha na conex�o: '  . mysqli_connect_error(), E_USER_ERROR);
}
*/

?>