import { APP } from '../config'
import { promptInstall, pwa } from '../state/pwa'
import { useStore } from '../state/store'
import { BandShape, IconAddSquare, IconShareIOS } from '../ui/icons'

export function InstallHelp() {
  const p = useStore(pwa)
  if (p.installed) return <p>O app já está instalado neste aparelho.</p>
  return (
    <div class="install">
      {p.canInstall && (
        <button class="btn btn-primary" onClick={() => void promptInstall()}>
          Instalar no aparelho
        </button>
      )}
      {p.ios ? (
        <ol class="ios-steps">
          <li>
            <span class="ios-icon">
              <IconShareIOS size={26} />
            </span>
            <span>
              No Safari, toque em <strong>Compartilhar</strong> (na barra de baixo ou de cima).
            </span>
          </li>
          <li>
            <span class="ios-icon">
              <IconAddSquare size={26} />
            </span>
            <span>
              Role a lista e toque em <strong>Adicionar à Tela de Início</strong>.
            </span>
          </li>
          <li>
            <span class="ios-icon ios-icon-text">OK</span>
            <span>
              Confirme em <strong>Adicionar</strong>. O ícone do {APP.name} aparece junto dos outros apps.
            </span>
          </li>
        </ol>
      ) : (
        !p.canInstall && (
          <p class="small">
            No Chrome do Android: menu <strong>⋮</strong> › <strong>Instalar app</strong> (ou “Adicionar à tela inicial”). No
            computador, use o ícone de instalar na barra de endereço do Chrome ou do Edge.
          </p>
        )
      )}
      <p class="small soft">Instalado, ele abre em tela própria e funciona sem internet.</p>
    </div>
  )
}

export function Home() {
  return (
    <div class="home">
      <section class="hero">
        <div class="hero-text">
          <p class="eyebrow">Para professores, de graça</p>
          <h1>Quanto barulho a sua sala faz, de verdade?</h1>
          <p class="lead">
            O {APP.name} usa o microfone do celular para medir o nível de ruído durante a aula. Fica na mesa, mostra um semáforo que
            a turma entende e, no fim, um relatório que você pode levar para a coordenação.
          </p>
          <div class="row">
            <a class="btn btn-primary btn-big" href="#/medir">
              Começar a medir
            </a>
            <button class="btn btn-quiet" onClick={() => document.getElementById('instalar')?.scrollIntoView({ behavior: 'smooth' })}>
              Instalar no celular
            </button>
          </div>
        </div>
        <figure class="hero-figure" aria-label="As três faixas do semáforo">
          <ul class="legend-stack">
            <li class="text-calmo">
              <BandShape band="calmo" size={40} />
              <span>
                <strong>Calmo</strong>
                <small>dá para falar sem forçar</small>
              </span>
            </li>
            <li class="text-atencao">
              <BandShape band="atencao" size={40} />
              <span>
                <strong>Atenção</strong>
                <small>conversa paralela subindo</small>
              </span>
            </li>
            <li class="text-alto">
              <BandShape band="alto" size={40} />
              <span>
                <strong>Alto</strong>
                <small>a voz começa a subir</small>
              </span>
            </li>
          </ul>
          <figcaption class="small soft">Cor, forma e palavra: dá para ler do fundo da sala e com daltonismo.</figcaption>
        </figure>
      </section>

      <section class="margin-block">
        <h2 class="margin-label">O que ele faz</h2>
        <ol class="numbered">
          <li>
            <strong>Mede a aula inteira.</strong> Você aperta começar, deixa o celular na mesa e segue a aula. A tela fica ligada e,
            se o microfone parar, o app tenta religar sozinho e marca o intervalo.
          </li>
          <li>
            <strong>Projeta um semáforo.</strong> Tela cheia, legível a 10 metros. Dá para combinar uma meta com a turma, como
            “10 minutos na faixa calma”. Conta o tempo bom; não pune o tempo ruim.
          </li>
          <li>
            <strong>Faz o relatório da aula.</strong> Média, picos, ruído de fundo, tempo em cada faixa e o Tempo de Risco Vocal:
            quanto tempo o ruído ficou no nível em que a gente tende a forçar a voz. Se você marcar os momentos (explicação,
            grupo, prova), ele mostra qual pesa mais.
          </li>
          <li>
            <strong>Mostra a evolução.</strong> Semana a semana e turma a turma: o Tempo de Risco Vocal somado e se a turma está
            ficando mais calma ou mais barulhenta.
          </li>
          <li>
            <strong>Mede a sala vazia.</strong> Um minuto sem ninguém na sala mostra o barulho que vem do prédio (ventilador, pátio,
            rua) e compara com os 35 dB(A) que a OMS recomenda.
          </li>
          <li>
            <strong>Junta dados para a escola.</strong> Os professores exportam um arquivo; a coordenação abre todos juntos e vê
            quais salas e horários pesam mais. Sem servidor, sem cadastro.
          </li>
        </ol>
      </section>

      <section class="margin-block">
        <h2 class="margin-label">O que ele não faz</h2>
        <ul class="plain">
          <li>
            <strong>Não grava áudio.</strong> Nem por um segundo. Só calcula o nível e guarda o número.
          </li>
          <li>
            <strong>Não envia nada.</strong> Sem conta, sem analytics. Os dados ficam no seu aparelho. <a href="#/privacidade">Privacidade</a>
          </li>
          <li>
            <strong>Não é sonômetro profissional.</strong> Sem calibração, mostra faixas relativas. Calibrado, mostra dB(A) com a
            margem de erro ao lado. <a href="#/calibrar">Como calibrar</a>
          </li>
          <li>
            <strong>Não faz diagnóstico.</strong> É um indicador de exposição ao ruído. Rouquidão que não passa é caso de
            fonoaudiologia.
          </li>
        </ul>
      </section>

      <section class="margin-block" id="instalar">
        <h2 class="margin-label">Instalar</h2>
        <InstallHelp />
      </section>
    </div>
  )
}
