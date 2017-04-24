

<?php
    include("Pessoa.class.php");
    include "acessa.php";
    
    $id=$_POST['id'];
    $placa= $_POST['placa'];
    $ctrc = $_POST['ctrc'];
    $cliente = $_POST['cliente'];
    $vlrplaca = $_POST['vlrplaca'];
    $vlrcliente=$_POST['vlrcliente'];
    $datafatura = $_POST['datafatura']; 
    $numerofatura = $_POST['numerofatura'];
    $totalfatura = $_POST['totalfatura'];
    $vencimento = $_POST['vencimento'];
    $datarecebimento = $_POST['datarecebimento'];
    $revfrete = $_POST['revfrete'];
    $custo = $_POST['custo'];
    $observacao = $_POST['observacao'];   
    $lote=$_POST['lote'];
    $vlrrecebido=$_POST['vlrrecebido']
   $sql="Update estadias SET placa = '$placa',ctrc = '$ctrc',cliente = '$cliente',vlrplaca = '$vlrplaca',vlrcliente = '$vlrcliente',datafatura = '$datafatura' ,numerofatura = '$numerofatura',totalfatura = '$totalfatura',vencimento = '$vencimento',datarecebimento = '$datarecebimento',revfrete = '$revfrete',custo = '$custo',observacao = '$observacao', lote = '$lote', vlrrecebido = '$vlrrecebido' where id = $id";
            if($conexao->query($sql) === false) {
                trigger_error('Erro na SQL: ' . $sql    . ' Erro: ' .
                $conexao->error, E_USER_ERROR);
            }
            else {
               $last_inserted_id = $conexao->insert_id; //ultima id inserir
			   $affected_rows = $conexao->affected_rows; //linhas afetadas
			   echo "Alterado com sucesso";

            }
            $conexao->close();
            
        
  
  ?>