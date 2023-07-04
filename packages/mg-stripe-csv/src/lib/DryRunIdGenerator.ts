class DryRunIdGenerator {
    counter = 0;

    getNext() {
        this.counter += 1;
        return 'fake_' + this.counter;
    }
}

export default new DryRunIdGenerator();
