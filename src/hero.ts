import { Ihero, Iplayer, Irequest, Ifeature } from './interfaces';
import { log, find_state_data, get_diff_time } from './util';
import { sleep } from './util';
import api from './api';
import player from './player';
import database from './database';

interface Ifeature_hero extends Ifeature, options {}

interface Irequest_hero extends Irequest {
	feature: Ifeature_hero
}

interface options {
	type: adventure_type
	min_health: number
	run: boolean
	error: boolean
}

class hero {
	// idents for state data
	hero_ident: string = 'Hero:';

	options: options = null;
	
	running: boolean = false;

	constructor() {
		this.options = database.get('hero.options').value();
		if(!this.options) {
			this.options = {
				type: 0,
				min_health: 15,
				run: false,
				error: false
			};
		}
	}

	handle_request(payload: Irequest_hero): any {
		const { action } = payload;

		if(action == 'start') {
			this.options.run = true;
			if(!this.running) this.start();
			return 'online';
		}

		if(action == 'stop') {
			this.stop();
			return 'offline';
		}

		if(action == 'update') {
			const { min_health, type } = payload.feature;
			this.options.type = Number(type);
			this.options.min_health = Number(min_health);

			database.set('hero.options', this.options).write();

			return 'success';
		}

		return 'error';
	}

	get_feature_params(): Ifeature_hero {
		const params: any = {
			ident: 'hero',
			name: 'auto adventure',
			description: (this.options.type == 0) ? 'short' : 'long',
			...this.options
		};

		return params;
	}

	stop(): void {
		this.options.run = false;
		database.set('hero.options', this.options).write();
	}

	start(): void {
		this.auto_adventure(this.options.type, this.options.min_health);
	}

	async auto_adventure(type: adventure_type, min_health: number): Promise<void> {
		try {
			this.running = true;
			log('auto adventure started');

			// write data to database
			this.options.min_health = min_health;
			this.options.type = type;
			this.options.run = true;

			database.set('hero.options', this.options).write();

			const player_data: Iplayer = await player.get();

			while(this.options.run) {
				// get hero data
				const response: any[] = await api.get_cache([ this.hero_ident + player_data.playerId]);
				const hero: Ihero = find_state_data(this.hero_ident + player_data.playerId, response);

				if (hero.adventurePoints > 0 && !hero.isMoving && hero.status == 0 && Number(hero.health) > min_health){
					let send: boolean = false;

					if(type == adventure_type.short && Number(hero.adventurePoints) > 0)
						send = true;
					else if(type == adventure_type.long && Number(hero.adventurePoints > 1))
						send = true;

					if(send) {
						await api.start_adventure(type);
						log('sent hero on adventure');
					}
				}

				const diff_time: number = get_diff_time(hero.untilTime);
				let sleep_time: number = 60;

				if(diff_time > 0) sleep_time = diff_time + 5;

				await sleep(sleep_time);
			}

			this.running = false;
			log('auto adventure stopped');
		} catch {
			log('error on feature auto adventure');
			this.running = false;
			this.options.run = false;
			this.options.error = true;
		}
	}
}

export enum adventure_type {
	short = 0,
	long = 1
}

export default new hero();
