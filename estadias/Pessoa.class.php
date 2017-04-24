<input value="< Home" type="button" onclick="location.href='menu.php'">

<?php      
		class Cliente {
		private $id;
        private $placa;
        private $ctrc;
        private $cliente;
        private $vlrplaca;
        private $vlrcliente;
        private $datafatura;
        private $numerofatura;
        private $totalfatura;
        private $vencimento;
        private $datarecebimento;
        private $revfrete; 
        private $custo;
        private $observacao;
        private $lote;
        private $vlrrecebido;
       
        public function __construct(){
            $this->placa="";
            $this->ctrc="";
            $this->cliente="";
            $this->vlrplaca="";
            $this->vlrcliente="";
            $this->datafatura="";
            $this->numerofatura="";
            $this->totalfatura="";
            $this->vencimento="";
            $this->datarecebimento="";
            $this->revfrete="";
            $this->custo="";
            $this->observacao="";
            $this->lote="";
            $this->vlrrecebido="";
        }
       
        public function getId(){
            return $this->id;
        }
       
        public function setId($id){
            $this->id = $id;
        }
       
        public function getPlaca(){
            return $this->placa;
        }
       
        public function setPlaca($placa){
            return $this->placa = $placa;
                  }
       
        public function getCtrc(){
            return $this->ctrc;
        }
       
        public function setCtrc($ctrc){
            $this->ctrc = $ctrc;
        }
       
        public function getCliente(){
            return $this->cliente;
        }
       
        public function setCliente($cliente){
            $this->cliente = $cliente;
        }
       
        public function getVlrPlaca(){
            return $this->vlrplaca;
        }
       
        public function setVlrPlaca($vlrplaca){
            $this->vlrplaca = $vlrplaca;
        }
       
        public function getVlrCliente(){
            return $this->vlrcliente;
        }
       
        public function setVlrCliente($vlrcliente){
            $this->vlrcliente = $vlrcliente;
        }
       
        public function getDataFatura(){
            return $this->datafatura;
        }
       
        public function setDataFatura($datafatura){
            $this->datafatura = $datafatura;
        }
       
        public function getNumeroFatura(){
            return $this->numerofatura;
        }
       
        public function setNumeroFatura($numerofatura){
        	return $this->numerofatura = $numerofatura;
        }
       
        public function getTotalFatura(){
            return $this->totalfatura;
        }
       
        public function setTotalFatura($totalfatura){
        	return $this->totalfatura = $totalfatura;
        }
        
         public function getVencimento(){
            return $this->vencimento;
        }
       
        public function setVencimento($vencimento){
        	return $this->vencimento = $vencimento;
        }
        
         public function getDataRecebimento(){
            return $this->datarecebimento;
        }
       
        public function setDataRecebimento($datarecebimento){
        	return $this->datarecebimento = $datarecebimento ;
        }
        
        public function getRevFrete(){
            return $this->revfrete;
        }
       
        public function setRevFrete($revfrete){
        	return $this->revfrete= $revfrete;
        }
        
        public function getCusto(){
            return $this->custo;
        }
       
        public function setCusto($custo){
        	return $this->custo= $custo;
        }
        
        public function getObservacao(){
            return $this->observacao;
        }
       
        public function setObservacao($observacao){
        	return $this->observacao= $observacao;
        }
        
                public function getLote(){
            return $this->lote;
        }
       
        public function setLote($lote){
        	return $this->lote= $lote;
        }
        
            public function getVlrRecebido(){
            return $this->vlrrecebido;
        }
       
        public function setVlrRecebido($vlrrecebido){
        	return $this->vlrrecebido= $vlrrecebido;
        }


            public function dados(){
            $id = $this->id;
            $placa = $this->placa;
            $ctrc = $this->ctrc;
            $cliente = $this->cliente;
            $vlrplaca = $this->vlrplaca;
            $datafatura = $this->datafatura;
            $numerofatura = $this->numerofatura;
            $totalfatura = $this->totalfatura;
            $vencimento = $this->vencimento;
            $datarecebimento = $this->datarecebimento;
            $revfrete = $this->revfrete;
            $custo = $this->custo;
            $observacao = $this->observacao;
            $lote = $this->lote;
            $vlrrecebido = $this-> vlrrecebido;
            $string = "<div> ID: $id | Cliente: $cliente | CTRC: $ctrc | Placa: $placa | Vlr. Placa: $vlrplaca | N. Fatura: $numerofatura | Vlr. Fatura: $totalfatura</div>" ;
            $string .= "<div> <a href='editarpessoa.php?id=$id'>Editar</a> | ";
            return $string;
        }

        
            public function inserirDados() {
            include "acessa.php";
            $placa = $this->placa;
            $ctrc = $this->ctrc;
            $cliente = $this->cliente;
            $vlrplaca = $this->vlrplaca;
            $datafatura = $this->datafatura;
            $numerofatura = $this->numerofatura;
            $totalfatura = $this->totalfatura;
            $vencimento = $this->vencimento;
            $datarecebimento = $this->datarecebimento;
            $revfrete = $this->revfrete;
            $custo = $this->custo;
            $observacao = $this->observacao;
            $lote = $this->lote;
            $vlrrecebido=$this->vlrrecebido;
            $sql="INSERT INTO estadias(id,placa,ctrc,cliente,vlrplaca,datafatura,numerofatura,totalfatura,vencimento,datarecebimento,revfrete,custo,observacao,lote,vlrrecebido)
           VALUES ('','$placa','$ctrc','$cliente','$vlrplaca','$datafatura','$numerofatura',
           '$totalfatura', '$vencimento', '$datarecebimento', '$revfrete', '$custo', '$observacao', '$lote','$vlrrecebido')";
            if($conexao->query($sql) === false) {
                trigger_error('Erro na SQL: ' . $sql    . ' Erro: ' .
                $conexao->error, E_USER_ERROR);
            }
            else {
                echo '';
            }
            $conexao->close();
        }
       
        public function listarPessoas(){
            include "acessa.php";
            $sql = "Select * from estadias";        
            if(!$resultado = $conexao->query($sql)) {
                trigger_error('Erro na SQL: ' . $sql    . ' Erro: ' .
                $conexao->error, E_USER_ERROR);
            }
            else { 
                //vamos listar as estadias cadastradas no banco
                while($linha = $resultado->fetch_assoc()) {
                	$this->id=$linha["id"];
                    $this->placa=$linha["placa"];
                    $this->ctrc=$linha["ctrc"];
                    $this->cliente=$linha["cliente"];
                    $this->vlrplaca=$linha["vlrplaca"];
                    $this->vlrcliente=$linha["vlrcliente"];         
                    $this->datafatura=$linha["datafatura"];
                    $this->numerofatura=$linha["numerofatura"];
                    $this->totalfatura=$linha["totalfatura"];
                    $this->vencimento=$linha["vencimento"];
                    $this->datarecebimento=$linha["datarecebimento"];
                    $this->revfrete=$linha["revfrete"];
                    $this->custo=$linha["custo"];
                    $this->observacao=$linha["observacao"];  
                    $this->lote=$linha['lote'];            
                    $this->vlrrecebido=$linha['vlrrecebido'];
                    echo $this->dados();
                    echo "<hr/><br/>";
                }
            }
                     
        }
       
       
        public function excluirPessoa($id) {
            include "acessa.php";
            $sql="Delete from estadias where id= $id";
            if($conexao->query($sql) === false) {
                trigger_error('Erro na SQL: ' . $sql    . ' Erro: ' .
                $conexao->error, E_USER_ERROR);
            }
            else {
                echo "Estadia excluida com sucesso";
            }
            
        }
       
        public function alterarPessoa($id) {
            include "acessa.php";
            $id=$this->id;
            $placa = $this->placa;
            $ctrc = $this->ctrc;
            $cliente = $this->cliente;
            $vlrplaca = $this->vlrplaca;
            $datafatura = $this->datafatura;
            $numerofatura = $this->numerofatura;
            $totalfatura = $this->totalfatura;
            $vencimento = $this->vencimento;
            $datarecebimento = $this->datarecebimento;
            $revfrete = $this->revfrete;
            $custo = $this->custo;
            $observacao = $this->observacao;
                        $lote = $this->lote;
                        $vlrrecebido=$this->vlrrecebido;
            
            $sql="Update estadias set placa = '$placa',ctrc = '$ctrc',cliente = '$cliente',vlrplaca = '$vlrplaca' ,datafatura = '$datafatura' ,numerofatura = '$numerofatura',totalfatura = '$totalfatura',vencimento = '$vencimento',datarecebimento = '$datarecebimento',revfrete = '$revfrete',custo = '$custo',observacao = '$observacao',lote='$lote', vlrrecebido = '$vlrrecebido' where id = $id";
            if($conexao->query($sql) === false) {
                trigger_error('Erro na SQL: ' . $sql    . ' Erro: ' .
                $conexao->error, E_USER_ERROR);
            }
            else {
                echo "Cadastro de estadias alterado com sucesso";
            }
            $conexao->close();
        }
       
       
    }
?>
<body bgcolor="#C0C0C0">
