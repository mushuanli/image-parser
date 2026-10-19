import * as api from '../src/index';
import {runRuntimeChecks} from './paper-runtime-checks';
Object.assign(window, {runImageChecks: (url?: string | null) => runRuntimeChecks(api, url)});
