import {Options} from "./Options.js";
import {StripeAPI} from "./StripeAPI.js";
import {StripeConnector} from "./StripeConnector.js";
import {ui} from '@tryghost/pretty-cli';
import SubscriptionImporter from "./importers/SubscriptionImporter.js";
import CouponImporter from "./importers/CouponImporter.js";

class StripeCSVCommand {
    id = 'stripe-csv';
    group = 'Sources:';
    flags = "stripe-csv"
    desc = 'Migrate your Stripe subscriptions to a different Stripe account';

    constructor() {
        // FIX `this` binding in the `run` method
        this.run = this.run.bind(this)
        this.setup = this.setup.bind(this)

    }

    async setup(sywac: any) {
        for (const option of Options.definitions) {
            sywac.option(option);
        }
    }

    async run(argv: any) {
        // Try to connect to Stripe
        ui.log.info(`Run`);

        const options = new Options(argv);

        // Step 1: Connect to Stripe
        const stripe = new StripeConnector();
        await stripe.connect();

        // Step 2: Validate connection
        await StripeAPI.shared.validate();

        const couponImporter = new CouponImporter(options.coupons);
        const subscriptionImporter = new SubscriptionImporter(
            options.subscriptions,
            {
                couponImporter
            }
        );

        await subscriptionImporter.importAll({
            dryRun: true,
            stripe: StripeAPI.shared
        });
    }
}

export default new StripeCSVCommand();
