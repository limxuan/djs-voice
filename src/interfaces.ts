import { Client } from "discord.js";

export interface options {
    mongooseConnectionString: string;
    client?: Client;
    allowBots?: boolean;
    debug?: boolean;
}

export interface UserObject {
    User: string;
    Time: number;
    position: number;
}
