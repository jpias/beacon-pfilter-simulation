// Jakub Piasecki 2014
// My attempt at particle filter based beacon location simulation
// based on http://web.mit.edu/16.412j/www/html/Advanced%20lectures/Slides/Hsaio_plinval_miller_ParticleFiltersPrint.pdf
// other research links: https://github.com/jpias/ibeacon_location_research

var beacons = [
    {label: "b1", x: 200, y: 200, color: "#2069ac", active: true},
    {label: "b2", x: 320, y: 240, color: "#358913", active: true},
    {label: "b3", x: 140, y: 300, color: "#b10292", active: true},
    {label: "b4", x: 240, y: 100, color: "#b1a602", active: false},
    {label: "b5", x: 900, y: 300, color: "#b15402", active: false}
]

var particles = []; // format {x:43,y:32,p:0.5}

var position = {x: 200, y: 310, color: "rgba(255,0,0,0.5)"};

var esitmatedPosition = {x: 0, y: 0, color: "rgba(0,0,255,0.5)"};


var simulationParams = {
    noOfParticles: 1000,
    movementStdDev: 15, // simulate movement of the target in y direction with gaussian distribution of this st. dev.
    signalRelativeStdDev: 0.15, // signal/error standard deviation relative to distance
    showParticles: true
};

var simulationSteps = {
    step: function () {
        this.simulateRead();
        this.predict();
        this.update();
        this.resample();
        this.guess();
    },
    run: function () {
        setInterval(this.step.bind(this), 1000);
    },
    // 1. Simulate reading from the beacons and movement of the target
    simulateRead: function () {
        // let's assume our target is moving in y direction
        position.y += randomFromGaussian(0, 15);
        // read from beacons, simulate some noise
        activeBeacons().forEach(function (beacon) {
            var rand = randomFromGaussian(0, simulationParams.signalRelativeStdDev);
            beacon.measuredDistance = distance(beacon, position) * (1 + rand);
        });
        draw();
    },
    // 2. Predict next position of each the particle
    // as we don't know direction or the speed of moving target we assume that it can move in every direction
    // according to some gaussian distribution, in future we could try to detect user movement based on other
    // sensors e.g. accelerometer
    predict: function () {
        particles.forEach(function (particle) {
            var movedParticle = randomPairFromGaussian(particle, simulationParams.movementStdDev);
            particle.x = movedParticle.x;
            particle.y = movedParticle.y;
        });
        draw();
    },
    // 3. Calculate probabilities for every particle
    update: function () {
        activeBeacons().forEach(function (beacon) {
            // let's assume that while we account for bigger error when the beacon is further from the particle
            var stdDev = beacon.measuredDistance * simulationParams.signalRelativeStdDev;
            var gaussian = new Gaussian(0, Math.pow(stdDev, 2));
            particles.forEach(function (particle) {
                var beaconParticleDistance = distance(beacon, particle);
                // calculate probability as CDF (cumulative distribution function) of
                // receiving reading from given beacon while being in the place of the particle
                // join probabilities for all beacons by multiplying
                // TODO: verify if the CDF is correct function to use here
                // TODO: verify if it's OK to multiply probabilities
                particle.p *= gaussian.cdf(-1 * Math.abs(beaconParticleDistance - beacon.measuredDistance));
            });
        });
        // normalize sum of all probabilities to 1
        var pSum = 0;
        particles.forEach(function (particle) {
            pSum += particle.p;
        });
        particles.forEach(function (particle) {
            particle.p = particle.p / pSum;
        });
        draw();
    },
    // 4. resample particles based on probabilties
    resample: function () {
        // see. http://robotics.stackexchange.com/questions/479/particle-filters-how-to-do-resampling
        // calculate sums
        particles.sort(function (a, b) {
            return a.p - b.p;
        });
        var cumulativeSums = [];
        for (var i = 0; i < particles.length; i++) {
            var p = particles[i].p;
            if (cumulativeSums.length == 0) {
                cumulativeSums.push(p);
            } else {
                cumulativeSums.push(cumulativeSums[i - 1] + p)
            }
        }
        // rasample
        var oldParticles = particles;
        particles = [];
        oldParticles.forEach(function (particle) {
            var random = Math.random();
            var previousBin = 0;

            // TODO: binary search here
            var i = 0;
            for (; i < cumulativeSums.length; i++) {
                if (random > previousBin && random < cumulativeSums[i]) {
                    break;
                }
                previousBin = cumulativeSums[i];
            }
            particles.push({
                x: oldParticles[i].x,
                y: oldParticles[i].y,
                p: oldParticles[i].p
            })
        });
        draw();

    },
    //5. average over all points to get our estimated position
    guess: function () {
        esitmatedPosition.x = 0;
        esitmatedPosition.y = 0;
        particles.forEach(function (particle) {
            esitmatedPosition.x += particle.x;
            esitmatedPosition.y += particle.y;
        });
        esitmatedPosition.x /= particles.length;
        esitmatedPosition.y /= particles.length;
        draw();
    },
    noOfParticles: 500
};


function main() {
    var gui = new dat.GUI();


    var folder = gui.addFolder("simulation");
    folder.add(simulationParams, "showParticles").onChange(draw);
    folder.add(simulationParams, "movementStdDev").onChange(draw);
    folder.add(simulationParams, "signalRelativeStdDev", 0.01, 1).onChange(draw);
    folder.add(simulationSteps, "run");
    folder.add(simulationSteps, "step");
    folder.add(simulationSteps, "simulateRead");
    folder.add(simulationSteps, "predict");
    folder.add(simulationSteps, "update");
    folder.add(simulationSteps, "resample");
    folder.add(simulationSteps, "guess");
    folder.open();

    var folder = gui.addFolder("position");
    folder.add(position, "x", 0, canvas().width).onChange(draw);
    folder.add(position, "y", 0, canvas().height).onChange(draw);
    folder.addColor(position, "color").onChange(draw);

    beacons.forEach(function (beacon) {
        var folder = gui.addFolder(beacon.label);
        folder.add(beacon, "active").onChange(draw);
        folder.add(beacon, "x", 0, canvas().width).onChange(draw);
        folder.add(beacon, "y", 0, canvas().height).onChange(draw);
        folder.addColor(beacon, "color").onChange(draw);
    });


    for (var i = 0; i < simulationParams.noOfParticles; i++) {
        particles.push({
                x: randomIntFromInterval(0, window.innerWidth),
                y: randomIntFromInterval(0, window.innerHeight),
                p: 1
            }
        );
    }
    draw();

    document.getElementById('showInstructionsButton').onclick = showInstructions;
    document.getElementById('hideInstructionsButton').onclick = hideInstructions;

}

function activeBeacons() {
    return beacons.filter(function (beacon) {
        return beacon.active;
    });
}

function canvas() {
    return document.getElementById('canvas');
}

function draw() {
    var ctx = canvas().getContext('2d');
    ctx.canvas.width = window.innerWidth;
    ctx.canvas.height = window.innerHeight;
    ctx.clearRect(0, 0, canvas().width, canvas().height)
    activeBeacons().forEach(function (beacon) {
        drawPoint(ctx, beacon.x, beacon.y, beacon.label, beacon.color);
        var radius = beacon.measuredDistance;
        drawCircle(ctx, beacon.x, beacon.y, radius, beacon.color);
    });


    // particles
    if (simulationParams.showParticles) {
        var pMin = 1;
        var pMax = 0;
        particles.forEach(function (particle) {
            if (particle.p > pMax) pMax = particle.p;
            if (particle.p < pMin) pMin = particle.p;
        });
        var pRange = pMax - pMin;
        particles.forEach(function (particle) {
            var color;
            if (pMin == pMax) {
                color = "#000000";
            } else {
                var gray = Math.floor(220 - 220 * (particle.p - pMin) / pRange);
                color = "rgb(" + gray + "," + gray + "," + gray + ")"
            }
            drawParticle(ctx, particle.x, particle.y, color);
        });
    }
    drawPoint(ctx, position.x, position.y, "X", position.color);
    drawPoint(ctx, esitmatedPosition.x, esitmatedPosition.y, "E", esitmatedPosition.color);
}

function distance(a, b) {
    return Math.sqrt(distanceSquared(a, b));
}

function distanceSquared(a, b) {
    return Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2);
}


function drawCircle(ctx, x, y, radius, color) {
    var maXRadius = 2000; //browser may throw errors for big radius
    if (radius > maXRadius) {
        return;
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
    ctx.closePath();
    ctx.stroke();
}

function drawPoint(ctx, x, y, label, color) {
    ctx.beginPath();
    var radius = 11;
    ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "12px Arial";
    var metrics = ctx.measureText(label);
    ctx.fillText(label, x - metrics.width / 2, y + 12 / 1.25 / 2);
}

function drawParticle(ctx, x, y, color) {
    ctx.fillStyle = color;
    var particleWidth = 4;
    ctx.fillRect(x - particleWidth / 2, y - particleWidth / 2, particleWidth, particleWidth);
}
// see http://jsfiddle.net/alanwsmith/GfAhy/
function randomIntFromInterval(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

// Box-Muller method
// see http://stackoverflow.com/questions/9951883/generating-values-from-normal-distribution-using-box-muller-method
function randomPairFromGaussian(mean, stdev) {
    var u = Math.random();
    var v = Math.random();
    return{
        x: mean.x + Math.sqrt(-2 * Math.log(u)) * Math.sin(2 * Math.PI * v) * stdev,
        y: mean.y + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * stdev
    }
}

// see http://www.protonfish.com/random.shtml
function rnd_snd() {
    return (Math.random() * 2 - 1) + (Math.random() * 2 - 1) + (Math.random() * 2 - 1);
}

function randomFromGaussian(mean, stdev) {
    return rnd_snd() * stdev + mean;
}

function showInstructions() {
    document.getElementById('instructions').style.visibility = 'visible';
}

function hideInstructions() {
    document.getElementById('instructions').style.visibility = 'hidden';
}
