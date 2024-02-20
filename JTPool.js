const INITIAL = 0;
const RUNNING = 1;

class JTPool {
    constructor(maxThread) {
        this.status = INITIAL;
        this.workQueue = []; // workQueue = [{id: xx, task: xx}]
        this.max = (undefined === maxThread) ? 3 : maxThread;
        this.current = 0;
    }

    addTask(task) {
        if (undefined === task || typeof task != 'function' || task.length < 1) {
            throw Error('Must be a function with a callback parameter. e.g. function(callback) {...}');
        }
        const timestamp = this._getTimestamp();
        this.workQueue.push({ 'id': timestamp, 'task': task });
        if (RUNNING === this.status && this.current < this.max) {
            this._check();
        }
        return timestamp;
    }

    removeTask(id) {
        for (const i in this.workQueue) {
            if (this.workQueue[i].id === id) {
                this.workQueue.splice(i, 1);
                break;
            }
        }
    }

    clear() {
        this.workQueue = [];
    }

    start() {
        if (INITIAL === this.status) {
            this.status = RUNNING;
            this._check();
        }
    }

    stop() {
        if (RUNNING === this.status) {
            this.status = INITIAL;
        }
    }

    sleep(timeInMillionSecond) {
        const task = function (callback) {
            setTimeout(function () {
                callback();
            }, timeInMillionSecond);
        };
        this.addTask(task);
    }

    finish(callback){
        this.finishCallback = callback;
    }

    _notifyComplete() {
        this.current--;
        this._check();

        if (this.finishCallback && this.current === 0) {
            this.finishCallback();
        }
    }

    _check() {
        let work;
        while (RUNNING === this.status && this.current < this.max) {
            work = this.workQueue.shift();
            if (undefined !== work) {
                this.current++;
                this._executeTask(work);
            } else {
                break;
            }
        }
    }

    _getTimestamp() {
        return new Date().getTime();
    }

    _executeTask(work) {
        const _this = this;
        const task = work.task;
        task(function () {
            _this._notifyComplete();
        });
    }
}

JTPool.inDebugMode = false;
module.exports = JTPool;
