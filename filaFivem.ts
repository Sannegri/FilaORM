import Discord, { Guild, GuildMember, Role } from 'discord.js';
import { PrismaClient, Player } from '@prisma/client';

const prisma = new PrismaClient();

const discordClient = new Discord.Client();
const discordToken = 'TOKEN_DO_DISCORD';

const db = async () => {
  await prisma.$connect();
  console.log('Conexão com o banco de dados estabelecida');
};
db();

function Event(eventName: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);

      console.log(`Evento '${eventName}' disparado`);

      return result;
    };

    return descriptor;
  };
}

class QueueSystem {
  constructor(private discordClient: Discord.Client) {}

  @Event('playerConnecting')
  async handlePlayerConnecting(playerName: string, setKickReason: (reason: string) => void) {
    const playerId = parseInt(playerName);

    if (!Number.isNaN(playerId)) {
      await this.handlePlayerConnected(playerId.toString());
    } else {
      setKickReason('Erro ao conectar. ID do jogador inválido.');
      console.log('Erro ao conectar. ID do jogador inválido:', playerName);
    }
  }

  @Event('playerDropped')
  async handlePlayerDropped(playerId: string) {
    await this.handlePlayerDisconnected(playerId.toString());
  }

  @Event('playerConnected')
  async handlePlayerConnected(playerId: string) {
    try {
      const existingPlayer = await prisma.player.findUnique({
        where: { playerId },
      });

      if (existingPlayer) {
        console.log(`Jogador ${playerId} já existe no banco de dados. Atualizando...`);

        await prisma.player.update({
          where: { playerId },
          data: { lastConnectedAt: new Date() },
        });
      } else {
        console.log(`Jogador ${playerId} conectado pela primeira vez. Registrando...`);

        await prisma.player.create({
          data: { playerId, lastConnectedAt: new Date() },
        });
      }

      await this.updatePlayerPosition(playerId);
    } catch (error) {
      console.error('Erro ao lidar com a conexão do jogador:', error);
    }
  }

  @Event('playerDisconnected')
  async handlePlayerDisconnected(playerId: string) {
    try {
      await prisma.player.update({
        where: { playerId },
        data: { lastDisconnectedAt: new Date() },
      });

      console.log(`Jogador ${playerId} desconectado`);
    } catch (error) {
      console.error('Erro ao lidar com a desconexão do jogador:', error);
    }
  }

  async updatePlayerPosition(playerId: string) {
    try {
      const discordGuildId = 'ID_DO_SERVIDOR_NO_DISCORD';
      const server: Guild | undefined = this.discordClient.guilds.cache.get(
        discordGuildId
      );

      if (!server) {
        console.error('Servidor não encontrado no Discord');
        return;
      }

      const roles: Role[] = server.roles.cache.array();

      roles.sort((a, b) => a.name.localeCompare(b.name));

      const player: Player = await prisma.player.update({
        where: { playerId },
        data: { position: roles.findIndex((role) => role.name === playerId) + 1 },
      });

      console.log(`Jogador ${playerId} - Posição: ${player.position}`);
    } catch (error) {
      console.error('Erro ao atualizar a posição do jogador:', error);
    }
  }
}

const queueSystem = new QueueSystem(discordClient);

discordClient.on('ready', () => {
  console.log('Bot do Discord conectado');
});

discordClient.login(discordToken).catch((error) => {
  console.error('Erro ao fazer login no Discord:', error);
});
