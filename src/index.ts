import { options } from "./interfaces";
import mongoose, { Document } from "mongoose";
import { Client, Message, MessageEmbed, User, VoiceState } from "discord.js";
import ms from "ms";
import { ReactionPages } from "reconlx";
export class VoiceClient {
    public client: Client;
    public options: options;

    public schemas = {
        timer: mongoose.model(
            "djs-voice-timers",
            new mongoose.Schema({
                User: String,
                Start: Number,
                Guild: String,
            })
        ),
        user: mongoose.model<userObject>(
            "djs-voice-users",
            new mongoose.Schema({
                User: String,
                Time: Number,
                Guild: String,
            })
        ),
    };
    constructor(options: VoiceClientOptions) {
        if (mongoose.connection.readyState === 1) return;
        if (!options.mongooseConnectionString)
            throw new Error(
                "There is no established  connection with mongoose and a mongoose connection is required!"
            );
        mongoose.connect(options.mongooseConnectionString, {
            useFindAndModify: true,
            useUnifiedTopology: true,
            useNewUrlParser: true,
        });
        this.options = options;
        this.client = options.client;
    }
    /**
     * @description Put this inside your voiceStateChange client event!
     * @param {VoiceState} oldState
     * @param {VoiceState} newState
     * @returns {Promise<void>}
     */
    public async startListener(oldState: VoiceState, newState: VoiceState) {
        if (newState.member.user.bot && !this.options.allowBots) return;
        const userID = newState.member.id;
        const guildID = newState.guild.id;

        if (
            newState.channel &&
            !(await this.schemas.timer.findOne({
                User: userID,
                Guild: guildID,
            }))
        ) {
            if (this.options.debug)
                console.log(
                    `${newState.member.user.tag} has joined a voice channel`
                );

            new this.schemas.timer({
                User: userID,
                Start: Date.now(),
                Guild: guildID,
            }).save();
        }

        if (oldState.channel.id && !newState.channel.id) {
            if (this.options.debug)
                console.log(
                    `${newState.member.user.tag} has left a voice channel`
                );

            this.schemas.timer.findOne(
                { User: userID, Guild: guildID },
                async (err, timerData) => {
                    if (!timerData) return;

                    this.schemas.user.findOne(
                        { User: userID, Guild: guildID },
                        async (err, userData) => {
                            const Time = Date.now() - timerData.Start;
                            timerData.delete();
                            if (this.options.debug)
                                console.log(
                                    ms(Time, { long: true }) +
                                        ` for ${newState.member.user.tag}`
                                );
                            if (!userData) {
                                new this.schemas.user({
                                    User: userID,
                                    Time,
                                    Guild: guildID,
                                }).save();
                            } else {
                                userData.Time += Time;
                                userData.save();
                            }
                        }
                    );
                }
            );
        }
    }

    /**
     * @description Fetching and sorting raw data from guild
     */
    public async sortUsers(message: Message): Promise<userObject[]> {
        const userLeaderboard = await this.schemas.user
            .find({ Guild: message.guild.id })
            .sort({ Time: -1 });

        return userLeaderboard;
    }

    /**
     * @description Gives you all the data you need about a user
     */
    public async getUserData(message: Message, user: User): Promise<userData> {
        const data = await this.schemas.user.findOne({
            Guild: message.guild.id,
            User: user.id,
        });
        if (!data) return null;
        const position = (await this.sortUsers(message)).findIndex(
            (x: any) => x.User === user.id
        );

        return { ...data, position };
    }

    /**
     * @description Sending a leaderboard!
     */
    public async sendLeaderboard(
        options: sendLeaderboardOptions
    ): Promise<void> {
        let { message, title, color, displayAllUsers, thumbnail } = options;

        const data = await this.sortUsers(message);

        let i = 1;
        if (displayAllUsers) {
            const chunks: userObject[][] = this.chunkArrays(data, 10);
            const array = [];
            for (const chunk of chunks) {
                const mapping = chunk
                    .map((value) => {
                        return `\`#${i++}\` <@${value.User}> (${ms(
                            value.Time
                        )})`;
                    })
                    .join("\n\n");

                array.push(
                    new MessageEmbed()
                        .setTitle(
                            title || `Leaderboard in **${message.guild.name}**`
                        )
                        .setColor(color || "RANDOM")
                        .setThumbnail(thumbnail || null)
                        .setDescription(mapping)
                );
            }

            ReactionPages(message, array, false);
        } else {
            const topTen = data.slice(0, 10);

            message.channel.send(
                new MessageEmbed()
                    .setTitle(
                        title || `Leaderboard in **${message.guild.name}**`
                    )
                    .setColor(color || "RANDOM")
                    .setThumbnail(thumbnail || null)
                    .setDescription(
                        topTen
                            .map((x) => {
                                return `\`${i++}\` <@${x.User}> (${ms(
                                    x.Time
                                )})`;
                            })
                            .join("\n\n")
                    )
            );
        }
    }

    /**
     * @description Reset the entire voice system database!
     */
    public async reset(message: Message) {
        await this.schemas.timer.deleteMany({ Guild: message.guild.id });
        await this.schemas.user.deleteMany({ Guild: message.guild.id });
    }

    /**
     * @description Chunk arrays into smaller arrays
     */
    public chunkArrays(arr: any[], size: number): any[][] {
        const array = [];
        for (let i = 0; i < arr.length; i += size) {
            array.push(arr.slice(i, i + size));
        }
        return array;
    }
}

export interface sendLeaderboardOptions {
    message: Message;
    title?: string;
    color?: string;
    displayAllUsers?: boolean;
    thumbnail?: string;
}
export interface userObject {
    User: string;
    Time: number;
    Guild: string;
}

export interface userData extends userObject {
    position: number;
}

export interface VoiceClientOptions {
    mongooseConnectionString: string;
    client: Client;
}
