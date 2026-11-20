import { APP } from '../config'

export function Privacy() {
  return (
    <article class="prose">
      <h1>Privacidade</h1>
      <p class="lead">Curto e direto, como manda a LGPD: o que o {APP.name} mede, onde guarda e o que nunca coleta.</p>

      <h2>O que é medido</h2>
      <p>
        O nível do som da sala, em números, oito vezes por segundo. O microfone é usado só para calcular esse nível. O som em si
        (vozes, conversas) não é gravado, nem por um instante: o cálculo acontece dentro do navegador e só o número sai dele.
      </p>

      <h2>O que fica no aparelho</h2>
      <ul>
        <li>Os níveis de cada aula (números), com horário, turma e disciplina, se você digitar.</li>
        <li>A calibração do microfone e os seus ajustes.</li>
      </ul>
      <p>
        Tudo isso fica no armazenamento deste navegador, neste aparelho. Para apagar: Ajustes › Apagar todos os dados, ou limpar os
        dados do site nas configurações do navegador.
      </p>

      <h2>O que nunca é coletado</h2>
      <ul>
        <li>Áudio, gravação ou transcrição.</li>
        <li>Nome, e-mail, telefone ou qualquer cadastro. O app não tem login.</li>
        <li>Localização.</li>
        <li>Estatísticas de uso, cookies de rastreamento ou anúncios. Não há analytics.</li>
      </ul>

      <h2>Quando os dados saem do aparelho</h2>
      <p>
        Só quando você exporta (PDF, CSV ou JSON) e entrega o arquivo para alguém. O arquivo leva os números, a turma e a disciplina.
        Não leva o seu nome. A tela Escola abre esses arquivos no próprio navegador de quem abre, sem enviar para servidor nenhum.
      </p>

      <h2>Servidor</h2>
      <p>
        O site é hospedado como arquivos estáticos. O servidor entrega o app na primeira visita, como qualquer página, e recebe os
        registros técnicos normais de acesso (endereço IP, navegador). Depois disso, o app funciona sem internet e não envia nada.
      </p>

      <h2>Crianças e adolescentes</h2>
      <p>
        O app não identifica alunos. Evite escrever nomes de estudantes nos campos de turma ou disciplina.
      </p>

      <h2>Código aberto</h2>
      <p>
        O código está publicado no GitHub. Qualquer pessoa pode conferir que não há gravação nem envio de dados.
      </p>
    </article>
  )
}
