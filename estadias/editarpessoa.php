<!DOCTYPE html>
<html lang="pt-br">
    <head>
    

        <meta charset="utf-8"/>
        <title>Estadia</title>
        
    </head>
    <body>
    <input value="< Home" type="button" onclick="location.href='menu.php'">
    <?php
    
    include("acessa.php");
    if (isset($_GET['id'])) {
    $idAlt = $_GET['id'];
    $sql = "SELECT * FROM estadias where id = $idAlt";
    
    $consulta = $conexao->query($sql);

if ($consulta===false) {
	trigger_error('Erro no SQL: '. $sql . 
	'Erro: '. $conexao->error,E_USER_ERROR);
}
else{
	
while ($linha = $consulta->fetch_assoc()) {
        ?>
        <h1>Editar Estadia</h1>
        
       	 
       	 
        <form action="editandoPessoa.php" method="post">
        <input type="hidden" name="id" value="<?=$idAlt;?>">
        
            <label for="cliente">Digite o Cliente</label><br/>
            <br/>  <input value="<?=$linha["cliente"];?>" type="text" id="cliente"  name="cliente"/>
            <br/><br/>
            
            <label for="ctrc">Digite o Ctrc</label><br/>
            <br/><input value="<?=$linha["ctrc"];?>"  type="text" id="ctrc" name="ctrc"/>
            <br/><br/>
            
            <label for="placa">Digite a Placa</label><br/>
            <br/><input value="<?=$linha["placa"];?>"  type="text" id="placa"  name="placa"/>
            
            <br/><br/>
            <label for="vlrcliente">Digite o Vlr. Cliente</label><br/>
            <br/><input value="<?=$linha["vlrcliente"];?>"  type="text" id="vlrcliente"  name="vlrcliente"/>
            
            <br/><br/>
            <label for="vlrplaca">Digite o Vlr. Placa</label><br/>
            <br/><input value="<?=$linha["vlrplaca"];?>"  type="text" id="vlrplaca"  name="vlrplaca"/>
             
            <br/><br/>
            <label for="datafatura">Digite a Data Fatura</label><br/>
            <br/><input value="<?=$linha["datafatura"];?>"  type="text" id="datafatura"  name="datafatura"/>
            
            <br/><br/>
            <label for="numerofatura">Digite o Numero da fatura</label><br/>
            <br/><input value="<?=$linha["numerofatura"];?>"  type="text" id="numerofatura"  name="numerofatura"/>
            
            <br/><br/>
            <label for="totalfatura">Digite o Total da fatura</label><br/>
            <br/><input value="<?=$linha["totalfatura"];?>"  type="text" id="totalfatura"  name="totalfatura"/>
            
            <br/><br/>
            <label for="vencimento">Digite o vencimento</label><br/>
            <br/><input value="<?=$linha["vencimento"];?>"  type="text" id="vencimento"  name="vencimento"/>
            
            <br/><br/>
            <label for="datarecebimento">Digite a Data de recebimento: </label><br/>
            <br/><input value="<?=$linha["datarecebimento"];?>"  type="text" id="datarecebimento"  name="datarecebimento"/>
            
              <br/><br/>
            <label for="vlrrecebido">Digite o valor recebido</label><br/>
            <br/><input value="<?=$linha["vlrrecebido"];?>"  type="text" id="vlrrecebido"  name="vlrrecebido"/>
            

            
            <br/><br/>
            <label for="revfrete">Digite o revertido em frete</label><br/>
            <br/><input value="<?=$linha["revfrete"];?>"  type="text" id="revfrete"  name="revfrete"/>
            
                        <br/><br/>

            <label for="revfrete">Lote: </label><br/>
            <br/><input value="<?=$linha["lote"];?>"  type="text" id="lote"  name="lote"/>

            
            <br/><br/>
            <label for="custo">Digite o Custo: </label><br/>
            <br/><input value="<?=$linha["custo"];?>"  type="text" id="custo"  name="custo"/>
            
            <br/><br/>
            <label for="observacao">Digite alguma Observação: </label><br/>
            <br/><input value="<?=$linha["observacao"];?>"  type="text" id="observacao"  name="observacao"/>
            <br/>
            <input type="submit" value="Alterar"/>
            <?php } }
} ?>
<body bgcolor="#C0C0C0">


        </form>
    </body>
</html>