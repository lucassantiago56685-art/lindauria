/**
 * Léxico base PT-BR, em ordem aproximada de frequência no português FALADO do dia a dia,
 * com reforço de vocabulário de cuidado (corpo, conforto, família, saúde).
 * A posição na lista vira a pontuação base da previsão. O app depois aprende as palavras
 * da própria pessoa (nomes, apelidos, expressões regionais) e elas passam na frente.
 */
export const LEXICON_PTBR: string[] = `
e de que o a não eu é um com uma para você do da em me tá está no na se mais muito
por os as mas bem isso aqui já sim meu minha ele ela quero vou tem ter foi ser
estou fazer agora então também tudo só quando como lá dia hoje bom boa obrigada obrigado
favor amor gente casa água dor frio calor fome sede banho cama mãe pai filho filha
neto neta vó vô amo te ajuda ajudar preciso precisa pode posso ir vem vamos
onde quem qual porque porquê depois antes ainda sempre nunca nada algo alguém
noite tarde manhã ontem amanhã cedo hora agora tempo semana mês ano
comer beber dormir sentar deitar levantar virar mexer coçar limpar trocar
cabeça braço perna pé mão costas barriga peito garganta olho olhos boca nariz ouvido
pescoço ombro joelho dedo pele coração respirar respiração ar falta cansada cansado
fraco fraca forte melhor pior tranquila tranquilo feliz triste medo saudade raiva
chama chamar liga ligar fala falar ouvir ver olhar ouve vê escuta
remédio médico médica enfermeira fisioterapeuta fono consulta hospital exame pressão febre
travesseiro cobertor lençol janela porta luz televisão tv música rádio celular
cadeira almofada fralda aspirar aspiração tosse engasgo engasgada engasgado
café leite suco chá sopa comida almoço jantar lanche fruta pão
quente gelada gelado morno pouco pouca bastante demais menos certo errado
estar sou somos são era eram fui foram fica ficar fiquei dá dar deu dei
quer querer queria gosto gosta gostar gostei sei saber sabe acho achar pensa pensar
lembra lembrar esqueci esquecer espera esperar calma devagar rápido logo
abre abrir fecha fechar liga desliga aumenta aumentar diminui diminuir baixa baixar sobe subir
cima baixo lado esquerdo esquerda direito direita frente trás perto longe dentro fora
oi olá tchau beijo abraço carinho querida querido lindo linda bonito bonita
deus graças oração rezar igreja fé paz
nós nos vocês eles elas dele dela seu sua nosso nossa este esta esse essa aquele aquela
outro outra outros todo toda todos todas cada mesmo mesma
um dois três quatro cinco seis sete oito nove dez
até sem sobre entre contra desde pelo pela pelos pelas num numa
também talvez claro certeza pena verdade mentira problema
trabalho escola visita visitar telefone mensagem whatsapp vídeo foto fotos
sol chuva rua carro passear
cachorro gato filhos netos família amigo amiga irmão irmã marido esposa tia tio
almoçar jantar tomar pegar trazer levar colocar tirar arrumar mudar
desculpa desculpe perdão parabéns feliz aniversário natal
tomara obrigadinha beleza legal ótimo ótima maravilha
coceira formigamento câimbra dormente inchado inchada machucado
xixi cocô banheiro urinar intestino
posição cabeceira travesseiro encosto
vez vezes coisa coisas jeito vida mundo pessoa pessoas
história notícia novela futebol jogo filme livro ler
saber entender entendi entendeu repete repetir devagar
próximo próxima último última primeiro primeira
música cantar dançar rir chorar sorrir
também então assim aí ali lá cá
sozinha sozinho junto juntos
quarto sala cozinha varanda
câmera tela teclado computador tablet
`
  .trim()
  .split(/\s+/)
  .filter((w, i, arr) => arr.indexOf(w) === i);

/**
 * Pares de palavras frequentes (próxima palavra provável). Formato "anterior seguinte".
 */
export const BIGRAMS_PTBR: string[] = `
bom dia|boa tarde|boa noite|por favor|muito obrigada|muito obrigado|te amo|eu quero|eu estou
eu preciso|eu tô|eu te|estou com|com dor|com fome|com sede|com frio|com calor|com medo|com sono
estou cansada|estou cansado|estou bem|tudo bem|muito bem|me ajuda|me ajude|me vira|me levanta
quero água|quero ir|quero dormir|quero comer|quero ver|quero falar|quero ficar|quero sair
preciso de|preciso ir|preciso falar|falta de|falta ar|dor de|dor no|dor na|dor nas|na cabeça
nas costas|no peito|na barriga|na perna|no braço|no pé|na garganta|liga a|liga o|desliga a
desliga o|a luz|a televisão|a tv|o ventilador|a janela|a porta|abre a|fecha a|chama a|chama o
que horas|não quero|não sei|não estou|não consigo|não precisa|sim por|obrigada por|obrigado por
graças a|a deus|meu deus|meu filho|minha filha|meu neto|minha neta|meu amor|minha mãe|meu pai
vira de|de lado|levanta a|a cabeceira|mais um|um pouco|pouco mais|mais alto|mais baixo
estou feliz|estou triste|com saudade|saudade de|vem aqui|fica aqui|fica comigo|como você
você está|está bem|está tudo|tudo certo|até amanhã|até logo|dormiu bem|vou dormir
`
  .trim()
  .split(/[|\n]/)
  .map((s) => s.trim())
  .filter(Boolean);

/** Começos de frase sugeridos quando ainda não há nada digitado. */
export const STARTERS_PTBR = ['eu', 'quero', 'estou', 'preciso', 'obrigada', 'não', 'sim', 'me'];
