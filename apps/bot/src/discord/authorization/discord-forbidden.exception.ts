export class DiscordForbiddenException extends Error {
  constructor(
    message = "Vous n'avez pas les permissions nécessaires pour utiliser cette fonctionnalité.",
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}
