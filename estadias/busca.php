<html>
    <head>
    <input value="< Home" type="button" onclick="location.href='menu.php'">

        <?php
include ("acessa.php");

            // Checar a conexÃƒÂ£o
            if (mysqli_connect_error()) trigger_error(mysqli_connect_error());
            $sql = "select cliente from estadias where cliente LIKE '%".$busca."%' group by cliente";
            $resultado = $conexao->query($sql);
            if ($resultado->num_rows > 0) {        
                while($linha = $resultado->fetch_assoc()) {
                    echo "<a href=?busca=".$linha["cliente"].">"
                    .$linha["cliente"]."</a><br/>";
                }
            }
            if (mysqli_connect_error()) trigger_error(mysqli_connect_error());
            if (isset($_GET["busca"]) and ($_GET["busca"]!='')) {              
                $busca = $_GET["busca"];
                $sqlbusca = "where cliente = $busca";
                //preparar e executar
                $sql = "Select * from estadias where cliente LIKE '%".$busca."%' order by cliente";
                $resultado = $conexao->query($sql);
                while($linha = $resultado->fetch_assoc()) {
                    echo "<a href=?busca=".$linha["cliente"].">"
                    .$linha["cliente"]."</a><br/>";

   	                    while($linha = $resultado->fetch_assoc()) {
                        echo "<pre>Cliente: " . $linha["cliente"]. " - CTRC: " .
                        $linha["ctrc"]. " - Numero Fatura: " . $linha["numerofatura"].
                        " - Vlr. Cliente: " . $linha["vlrcliente"].
                        "<br>";
                    }
                    }
                    } else {
                    echo "Nenhum resultado encontrado";
                }
                $conexao->close();
            
        ?>
        <body bgcolor="#C0C0C0">

