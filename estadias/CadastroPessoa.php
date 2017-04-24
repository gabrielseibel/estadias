
<?php
    include ("Pessoa.class.php");
   
    $placa= $_POST["placa"];
    $ctrc = $_POST["ctrc"];
    $cliente = $_POST["cliente"];
    $vlrplaca = $_POST["vlrplaca"];
    $vlrcliente = $_POST["vlrcliente"];
    $datafatura = $_POST["datafatura"]; 
    $numerofatura = $_POST["numerofatura"];
    $totalfatura = $_POST["totalfatura"];
    $vencimento = $_POST["vencimento"];
    $datarecebimento = $_POST["datarecebimento"];
    $revfrete = $_POST["revfrete"];
    $custo = $_POST["custo"];
    $observacao = $_POST["observacao"];   
    $lote=$_POST['lote'];
    $vlrrecebido=$_POST['vlrrecebido'];
       
    $clientes = new Cliente();
    $clientes ->setPlaca($placa);
    $clientes ->setCtrc($ctrc);
    $clientes ->setCliente($cliente);
    $clientes ->setVlrPlaca($vlrplaca);
    $clientes ->setVlrCliente($vlrcliente);
    $clientes ->setDataFatura($totalfatura);
    $clientes ->setVencimento($vencimento);
    $clientes ->setDataRecebimento($datarecebimento);
    $clientes ->setRevFrete($revfrete);
    $clientes ->setCusto($custo); 
    $clientes ->setObservacao($observacao);
    $clientes->setLote($lote);
    $clientes->setVlrRecebido($vlrrecebido);
             
    $dados = $clientes->inserirDados();
    
    echo '<p>Registro de estadia efetuado com sucesso</p>';
?>
<body bgcolor="#C0C0C0">


