const snekfetch = require('snekfetch');
const moment    = require('moment');
const exec      = require('child_process').exec;
const time      = require('time-parser');
const fs        = require('fs');
const os        = require('os');

require('moment-duration-format');

exports.run = async function (msg) {
    const cmd = msg.content.toLowerCase().substring(settings.defaultPrefix.length).split(' ')[0];

    if (cmd === 'ping' || mentioned(msg, 'ping'))
        msg.channel.send(`:ping_pong: Pong! ${client.pings[0]}ms`);

    if (['reboot', 'restart'].includes(cmd) || mentioned(msg, ['reboot', 'restart'])) {
        if (msg.author.id !== settings.ownerID)
            return msg.reply('You do not have permission to use this command.');
        await msg.channel.send('Restarting...');
        await client.destroy();
        process.exit();
    }

    if (cmd === 'invite' || mentioned(msg, 'invite'))
        msg.channel.send({
            embed: new Discord.RichEmbed()
                .setColor(settings.embedColor)
                .setDescription(`Click [here](https://discordapp.com/oauth2/authorize?permissions=27648&scope=bot&client_id=${client.user.id}) to invite me to your server, or click [here](https://discord.gg/Yphr6WG) for an invite to RemindMeBot\'s support server.`)
        });

    if (['stats', 'info'].includes(cmd) || mentioned(msg, ['stats', 'info'])) {
        const embed = new Discord.RichEmbed()
            .setColor(settings.embedColor)
            .setTitle(`RemindMeBot ${settings.version}`)
            .setURL('https://discordbots.org/bot/290947970457796608')
            .addField('Guilds', client.guilds.size, true)
            .addField('Uptime', moment.duration(process.uptime(), 'seconds').format('dd:hh:mm:ss'), true)
            .addField('Ping', `${client.ping.toFixed(0)} ms`, true)
            .addField('RAM Usage', `${(process.memoryUsage().rss / 1048576).toFixed()}MB/${(os.totalmem() > 1073741824 ? `${(os.totalmem() / 1073741824).toFixed(1)} GB` : `${(os.totalmem() / 1048576).toFixed()} MB`)}
(${(process.memoryUsage().rss / os.totalmem() * 100).toFixed(2)}%)`, true)
            .addField('System Info', `${process.platform} (${process.arch})\n${(os.totalmem() > 1073741824 ? `${(os.totalmem() / 1073741824).toFixed(1)} GB` : `${(os.totalmem() / 1048576).toFixed(2)} MB`)}`, true)
            .addField('Libraries', `[Discord.js](https://discord.js.org) v${Discord.version}\nNode.js ${process.version}`, true)
            .addField('Links', '[Bot invite](https://discordapp.com/oauth2/authorize?permissions=27648&scope=bot&client_id=290947970457796608) | [Support server invite](https://discord.gg/Yphr6WG) | [GitHub](https://github.com/Aetheryx/remindme)', true)
            .setFooter('Created by Aetheryx#2222');

        msg.channel.send({ embed });
    }

    if (cmd === 'help' || mentioned(msg, 'help'))
        msg.channel.send(`To set a reminder, simply send \`${settings.defaultPrefix}remindme\` and follow the instructions. Alternatively, you can also send \`${settings.defaultPrefix}remindme time_argument "message"\`, \ne.g. \`${settings.defaultPrefix}remindme 31 December 2017 "New Years"\`.\nMy prefix is \`${settings.defaultPrefix}\`; here's a list of my commands: `, {
            embed: new Discord.RichEmbed()
                .setColor(settings.embedColor)
                .setDescription('remindme, list, clear, info, ping, help, invite, forget'.split(', ').sort().join(', '))
        });

    if (['reminders', 'list'].includes(cmd) || mentioned(msg, ['reminders', 'list'])) {
        if (!db[msg.author.id] || db[msg.author.id].length === 0)
            return msg.reply('You have no reminders set!');
        client.users.get(msg.author.id).send({
            embed: new Discord.RichEmbed()
                .setColor(settings.embedColor)
                .addField(`Current reminder${plural(db[msg.author.id])}:`, db[msg.author.id].map((r) => r.reminder).join('\n'))
                .setFooter(`Reminder${plural(db[msg.author.id])} set to expire in(dd:hh:mm:ss): ${db[msg.author.id].map((b) => moment.duration(b.when - Date.now(), 'milliseconds').format('dd:hh:mm:ss')).join(', ')}`)
        });
    }

    if (['clear', 'delete'].includes(cmd) || mentioned(msg, ['clear', 'delete'])) {
        if (!db[msg.author.id] || db[msg.author.id].length === 0)
            return msg.reply('You have no reminders set!');

        msg.channel.send(':warning: This will delete all of your reminders! Are you sure? (`y`/`n`)');

        const collector = msg.channel.createMessageCollector(m => msg.author.id === m.author.id, { time: 40000 });

        collector.on('collect', (m) => {
            if (m.content.toLowerCase() === 'y' || m.content.toLowerCase() === 'yes') {
                db[msg.author.id] = [];
                fs.writeFile('./storage/reminders.json', JSON.stringify(db, '', '\t'), (err) => {
                    if (err) 
                        return msg.channel.send(`Your reminders weren't cleared.\n${err.message}`);
                    msg.channel.send(':ballot_box_with_check: Reminders cleared.');
                });
            } else {
                msg.channel.send(':ballot_box_with_check: Cancelled.');
            }
            return collector.stop();
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time')
                msg.channel.send('Prompt timed out.');
        });
    }

    if (msg.content.toLowerCase() === `${settings.defaultPrefix}remindme` || mentioned(msg, ['remind me', 'remindme'])) {
        msg.channel.send('What would you like the reminder to be? (You can send `cancel` at any time to cancel creation.)');

        const collector = msg.channel.createMessageCollector((m) => msg.author.id === m.author.id, { time: 40000 });

        let step = 1;

        const dboption = {
            'reminder': undefined,
            'when': undefined,
            'made': msg.createdTimestamp
        };

        collector.on('collect', (m) => {
            if (m.content.toLowerCase() === `${settings.defaultPrefix}remindme` || m.content.toLowerCase() === 'cancel') 
                return collector.stop();

            if (step === 1) {
                if (m.content.length === 0)
                    return msg.channel.send('The reminder cannot be empty.\nWhat would you like the reminder to be?');

                dboption.reminder = m.content;

                msg.channel.send('When would you like to be reminded? (e.g. 24 hours)');
            }

            if (step === 2) {
                let tParse = time(m.content).absolute;

                if (m.content.includes('next'))
                    tParse = time(m.content.replace(/next/g, 'one')).absolute;

                if (m.content.startsWith('a ') || m.content.startsWith('an '))
                    tParse = time(m.content.replace(/a /g, 'one ').replace(/an /g, 'one ')).absolute;

                if (m.content.includes(' min'))
                    tParse = time(m.content.replace(/ min/g, 'minutes ')).absolute;

                if (!isNaN(m.content) || !tParse)
                    return msg.channel.send('Invalid time.\nWhen would you like to be reminded? (e.g. 24 hours)');

                if (time(m.content).relative < 0) {
                    collector.stop();
                    return msg.channel.send('Your reminder wasn\'t added because it was set for the past. Note that if you\'re trying to set a reminder for the same day at a specific time (e.g. `6 PM`), UTC time will be assumed.');
                }

                collector.stop();
                dboption.when = tParse;
                if (!db[msg.author.id])
                    db[msg.author.id] = [];

                db[msg.author.id].push(dboption);
                fs.writeFile('./storage/reminders.json', JSON.stringify(db, '', '\t'), (err) => {
                    if (err) return msg.channel.send(`Your reminder wasn't added.\n${err.message}`);
                    msg.channel.send({
                        embed: new Discord.RichEmbed()
                            .setColor(settings.embedColor)
                            .setDescription(`:ballot_box_with_check: Reminder added: ${dboption.reminder}`)
                            .setFooter('Reminder set for ')
                            .setTimestamp(new Date(tParse))
                    });
                });
            }
            step++;
        });
        collector.on('end', (collected, reason) => {
            if (reason === 'time') 
                msg.channel.send('Prompt timed out.');
        });
    }

    if (cmd === 'forget') { // Very beta, kind of unstable.
        if (!db[msg.author.id] || db[msg.author.id].length === 0)
            return msg.reply('You have no reminders set!');

        msg.channel.send('Here\'s a list of your current reminders: ', {
            embed: new Discord.RichEmbed()
                .setColor(settings.embedColor)
                .setTitle('Reminders')
                .setDescription(Object.keys(db[msg.author.id]).map((e, i) => `[${i + 1}] ${db[msg.author.id][e].reminder}`).join('\n'))
                .setFooter('Send the number of the reminder you want me to forget(e.g. 3), or send c to cancel.')
        });
        const collector = msg.channel.createMessageCollector((m) => msg.author.id === m.author.id, { time: 40000 });
        collector.on('collect', (m) => {
            if (m.content.toLowerCase().startsWith(`${settings.defaultPrefix}forget`) || m.content.toLowerCase() === 'cancel' || m.content.toLowerCase() === 'c') 
                return collector.stop();
                
            if (isNaN(m.content))
                return msg.channel.send('Argument entered is not a number. Send the number of the reminder you want me to forget (e.g. `3`), or send `c` to cancel.');

            if (parseInt(m.content) > Object.keys(db[msg.author.id]).length)
                return msg.channel.send('You don\'t have that many reminders, please choose a lower number.');

            const reminder = db[msg.author.id][parseInt(m.content) - 1];
            db[msg.author.id] = db[msg.author.id].filter((x) => x.reminder !== db[msg.author.id][parseInt(m.content) - 1].reminder);

            fs.writeFile('./storage/reminders.json', JSON.stringify(db, '', '\t'), (err) => {
                if (err) return msg.channel.send(`Your reminder wasn't removed.\n${err.message}`);
            });

            msg.channel.send(`Reminder \`${reminder.reminder}\` deleted.`);
            return collector.stop();
        });
    }

    const args = msg.content.split(' ').slice(1);

    if (cmd === 'ev') {
        if (msg.author.id !== settings.ownerID) return false;
        let script = args.join(' ');
        const silent = script.includes('--silent') ? true : false;
        const asynchr = script.includes('--async') ? true : false;
        if (silent || asynchr) script = script.replace('--silent', '').replace('--async', '');

        try {
            let code = asynchr ? eval(`(async()=>{${script}})();`) : eval(script);
            if (code instanceof Promise && asynchr) code = await code;
            if (typeof code !== 'string')
                code = require('util').inspect(code, {
                    depth: 0
                });
            code = code.replace(new RegExp(client.token, 'gi'), 'fite me irl');
            if (!silent) msg.channel.send(code, { code: 'js' });
        } catch (e) {
            msg.channel.send(`\n\`ERROR\` \`\`\`xl\n${e}\n\`\`\``);
        }
    }

    if (cmd === 'exec') {
        if (msg.author.id !== settings.ownerID)
            return false;

        exec(args.join(' '), async (e, stdout, stderr) => {
            if (stdout.length > 2000 || stderr.length > 2000) {
                const res = await snekfetch.post('https://hastebin.com/documents')
                    .send(`${stdout}\n\n${stderr}`)
                    .catch((e) => msg.channel.send(e.message));

                msg.channel.send({
                    embed: new Discord.RichEmbed()
                        .setColor(settings.embedColor)
                        .setDescription(`Console log exceeds 2000 characters. View [here](https://hastebin.com/${res.body.key}).`)
                });
            } else {
                stdout && msg.channel.send(`Info: \n\`\`\`${stdout}\`\`\``);
                stderr && msg.channel.send(`Errors: \n\`\`\`${stderr}\`\`\``);
                if (!stderr && !stdout)
                    msg.react('\u2611');
            }
        });
    }

    if (cmd === 'prefix')
        return msg.channel.send('Custom prefixes aren\'t supported in DMs!');

    if (cmd === 'remindme' && msg.content.length > settings.defaultPrefix.length + 10) {
        if (!msg.content.includes('"'))
            return msg.channel.send(`Argument error. Please follow the proper syntax for the command:\n\`${settings.defaultPrefix}remindme time_argument "message"\`, e.g. \`${settings.defaultPrefix}remindme 31 December 2017 "New Years"\``);

        const timeArg = msg.content.substring(settings.defaultPrefix.length + 9, msg.content.indexOf('"') - 1);
        let tParse = time(timeArg).absolute;

        if (timeArg.includes('next'))
            tParse = time(timeArg.replace(/next/g, 'one')).absolute;

        if (timeArg.startsWith('a ') || timeArg.startsWith('an '))
            tParse = time(timeArg.replace(/a /g, 'one ').replace(/an /g, 'one ')).absolute;

        if (!isNaN(timeArg) || !tParse)
            return msg.channel.send('Invalid time argument. Please enter a proper time argument, e.g. `12 hours` or `next week`.');

        if (time(timeArg).relative < 0)
            return msg.channel.send('Your reminder wasn\'t added because it was set for the past. Note that if you\'re trying to set a reminder for the same day at a specific time (e.g. `6 PM`), UTC time will be assumed.');

        const reminder = msg.content.substring(msg.content.indexOf('"') + 1, msg.content.length - 1),
            dboption = {
                'reminder': reminder,
                'when': tParse,
                'made': msg.createdTimestamp
            };

        if (!db[msg.author.id])
            db[msg.author.id] = [];

        db[msg.author.id].push(dboption);
        fs.writeFile('./storage/reminders.json', JSON.stringify(db, '', '\t'), (err) => {
            if (err) return msg.channel.send(`Your reminder wasn't added.\n${err.message}`);
            msg.channel.send({
                embed: new Discord.RichEmbed()
                    .setColor(settings.embedColor)
                    .setDescription(`:ballot_box_with_check: Reminder added: ${dboption.reminder}`)
                    .setFooter('Reminder set for ')
                    .setTimestamp(new Date(tParse))
            });
        });
    }
};

function plural (x) {
    return x.length > 1 ? 's' : '';
}

function mentioned (msg, x) {
    if (!Array.isArray(x)) 
        x = [x];
    return msg.isMentioned(client.user.id) && x.some((c) => msg.content.toLowerCase().includes(c));
}
